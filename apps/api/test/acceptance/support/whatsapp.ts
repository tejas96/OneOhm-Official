import { createHmac, randomUUID } from 'node:crypto';
import { rows } from './db';
import { API } from './http';

/** The app secret the runner gives the acceptance API, so the suite can sign like Meta. */
export const WHATSAPP_SECRET = 'oneohm-acceptance-whatsapp-secret';

/** Until the returned undo runs, the database refuses every reply to this number. */
export async function refuseRepliesTo(phone: string): Promise<() => Promise<void>> {
  const name = `refuse_reply_${phone.slice(1)}`;
  await rows(`CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
    BEGIN IF NEW.recipient = '${phone}' THEN RAISE EXCEPTION 'refused'; END IF; RETURN NEW; END;
    $$ LANGUAGE plpgsql`);
  await rows(`CREATE TRIGGER ${name} BEFORE INSERT ON outbox
    FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  return async () => {
    await rows(`DROP TRIGGER ${name} ON outbox`);
    await rows(`DROP FUNCTION ${name}()`);
  };
}

/** What a test can send as a customer's WhatsApp message. */
export interface InboundMessage {
  text?: string;
  buttonPayload?: string;
  /** A tap on one of our interactive reply buttons, by its id. */
  buttonReply?: string;
  /** A tap on a row of one of our interactive lists, by its id. */
  listReply?: string;
  id?: string;
  /** A photo, paper, voice note or video, as Meta posts it; `fileId` is WhatsApp's media id. */
  media?: {
    type: 'image' | 'document' | 'audio' | 'video';
    fileId: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
  };
  /** A reply to a form (Flow) we sent: our token, and the files it carries as Meta posts them. */
  form?: {
    token: string;
    photos?: Record<string, unknown>[];
    pdfs?: Record<string, unknown>[];
    /** The "I paid another way" form's typed amount and picked day. */
    amount?: string | number;
    date?: string;
  };
  /** A location pin, as Meta posts it. */
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  /** A shared contact card, as Meta posts it. */
  contact?: { name: string; phone: string };
  /** A sticker, as Meta posts it. */
  sticker?: boolean;
  /** A reaction (emoji) to one of our messages, as Meta posts it. */
  reaction?: string;
  /** Meta's click-to-WhatsApp `referral` object, as it arrives on the first message. */
  referral?: Record<string, string>;
  /** The sender's WhatsApp name; null sends none (a number without a profile name). */
  profileName?: string | null;
  /** When the customer sent it (Meta's timestamp); now when left out. */
  at?: Date;
}

/**
 * A customer's WhatsApp message arriving at the webhook, shaped and signed like Meta's.
 * `text` is a typed message; `buttonPayload` is a tap on a template quick-reply button.
 * The API answers while handling the post, so the reply is already in the outbox on return.
 */
export async function sendInbound(from: string, message: InboundMessage): Promise<void> {
  const res = await postInbound(from, message);
  if (!res.ok) throw new Error(`POST /webhooks/whatsapp → ${res.status} ${await res.text()}`);
}

/** The same post as `sendInbound`, answering with the webhook's response whatever it is. */
export async function postInbound(from: string, message: InboundMessage): Promise<Response> {
  const wa = from.replace(/^\+/, '');
  const base = {
    from: wa,
    id: message.id ?? `wamid.acceptance-${randomUUID()}`,
    timestamp: String(Math.floor((message.at?.getTime() ?? Date.now()) / 1000)),
  };
  const sent = messageOf(base, message);
  if (message.referral) sent.referral = message.referral;
  const raw = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts:
                message.profileName === null
                  ? []
                  : [
                      {
                        wa_id: wa,
                        profile: { name: message.profileName ?? 'Acceptance Customer (test)' },
                      },
                    ],
              messages: [sent],
            },
          },
        ],
      },
    ],
  });
  return signedPost(raw);
}

/** Meta's delivery receipt for one of our messages, by its WhatsApp message id. */
export async function sendStatus(
  providerMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  errorCode = 131053,
): Promise<void> {
  const error = { code: errorCode, title: 'Media upload error' };
  const receipt = {
    id: providerMessageId,
    status,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(status === 'failed' ? { errors: [error] } : {}),
  };
  const value = { statuses: [receipt] };
  await postSigned(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value }] }],
    }),
  );
}

/** Posts to the webhook signed with the app secret, as Meta does. */
async function postSigned(raw: string): Promise<void> {
  const res = await signedPost(raw);
  if (!res.ok) throw new Error(`POST /webhooks/whatsapp → ${res.status} ${await res.text()}`);
}

function signedPost(raw: string): Promise<Response> {
  return fetch(`${API}/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', WHATSAPP_SECRET).update(raw).digest('hex')}`,
    },
    body: raw,
  });
}

/** An interactive tap as Meta posts it; the title is what WhatsApp shows, not the id. */
function interactive(
  base: Record<string, string>,
  kind: 'button_reply' | 'list_reply',
  id: string,
) {
  return {
    ...base,
    type: 'interactive',
    interactive: { type: kind, [kind]: { id, title: 'Tap' } },
  };
}

/** A location pin, a contact card or a sticker as Meta posts it; null for anything else. */
function otherOf(base: Record<string, string>, message: InboundMessage) {
  if (message.location) return { ...base, type: 'location', location: message.location };
  if (message.reaction)
    return {
      ...base,
      type: 'reaction',
      reaction: { message_id: 'wamid.x', emoji: message.reaction },
    };
  if (message.sticker) return { ...base, type: 'sticker', sticker: { id: 'sticker-1' } };
  if (!message.contact) return null;
  const { name, phone } = message.contact;
  return {
    ...base,
    type: 'contacts',
    contacts: [{ name: { formatted_name: name }, phones: [{ phone }] }],
  };
}

/** A reply to one of our forms as Meta posts it: the token and the files of the screen used. */
function formMessage(
  base: Record<string, string>,
  form: NonNullable<InboundMessage['form']>,
): Record<string, unknown> {
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'nfm_reply',
      nfm_reply: {
        name: 'flow',
        body: 'Sent',
        response_json: JSON.stringify({
          flow_token: form.token,
          ...(form.photos ? { photos: form.photos } : {}),
          ...(form.pdfs ? { pdfs: form.pdfs } : {}),
          ...(form.amount !== undefined ? { amount: form.amount } : {}),
          ...(form.date ? { date: form.date } : {}),
        }),
      },
    },
  };
}

/** The Meta message object for what the test sends: media, a tap, or typed text. */
function messageOf(base: Record<string, string>, message: InboundMessage): Record<string, unknown> {
  const other = otherOf(base, message);
  if (other) return other;
  if (message.form) return formMessage(base, message.form);
  return message.media
    ? {
        ...base,
        type: message.media.type,
        [message.media.type]: {
          id: message.media.fileId,
          mime_type: message.media.mimeType ?? 'application/octet-stream',
          ...(message.media.filename ? { filename: message.media.filename } : {}),
          ...(message.media.caption ? { caption: message.media.caption } : {}),
        },
      }
    : message.buttonPayload !== undefined
      ? { ...base, type: 'button', button: { payload: message.buttonPayload, text: 'Tap' } }
      : message.buttonReply !== undefined
        ? interactive(base, 'button_reply', message.buttonReply)
        : message.listReply !== undefined
          ? interactive(base, 'list_reply', message.listReply)
          : { ...base, type: 'text', text: { body: message.text ?? '' } };
}
