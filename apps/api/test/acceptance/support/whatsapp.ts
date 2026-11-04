import { createHmac, randomUUID } from 'node:crypto';
import { API } from './http';

/** The app secret the runner gives the acceptance API, so the suite can sign like Meta. */
export const WHATSAPP_SECRET = 'oneohm-acceptance-whatsapp-secret';

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
): Promise<void> {
  const error = { code: 131053, title: 'Media upload error' };
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

/** The Meta message object for what the test sends: media, a tap, or typed text. */
function messageOf(base: Record<string, string>, message: InboundMessage): Record<string, unknown> {
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
