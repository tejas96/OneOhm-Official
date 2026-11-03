import { createHmac, randomUUID } from 'node:crypto';
import { API } from './http';

/** The app secret the runner gives the acceptance API, so the suite can sign like Meta. */
export const WHATSAPP_SECRET = 'oneohm-acceptance-whatsapp-secret';

/**
 * A customer's WhatsApp message arriving at the webhook, shaped and signed like Meta's.
 * `text` is a typed message; `buttonPayload` is a tap on a template quick-reply button.
 * The API answers while handling the post, so the reply is already in the outbox on return.
 */
export async function sendInbound(
  from: string,
  message: {
    text?: string;
    buttonPayload?: string;
    /** A tap on one of our interactive reply buttons, by its id. */
    buttonReply?: string;
    /** A tap on a row of one of our interactive lists, by its id. */
    listReply?: string;
    id?: string;
    /** Meta's click-to-WhatsApp `referral` object, as it arrives on the first message. */
    referral?: Record<string, string>;
  },
): Promise<void> {
  const wa = from.replace(/^\+/, '');
  const base = {
    from: wa,
    id: message.id ?? `wamid.acceptance-${randomUUID()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const sent: Record<string, unknown> =
    message.buttonPayload !== undefined
      ? { ...base, type: 'button', button: { payload: message.buttonPayload, text: 'Tap' } }
      : message.buttonReply !== undefined
        ? interactive(base, 'button_reply', message.buttonReply)
        : message.listReply !== undefined
          ? interactive(base, 'list_reply', message.listReply)
          : { ...base, type: 'text', text: { body: message.text ?? '' } };
  if (message.referral) sent.referral = message.referral;
  const raw = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: wa, profile: { name: 'Acceptance Customer (test)' } }],
              messages: [sent],
            },
          },
        ],
      },
    ],
  });
  const res = await fetch(`${API}/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', WHATSAPP_SECRET).update(raw).digest('hex')}`,
    },
    body: raw,
  });
  if (!res.ok) throw new Error(`POST /webhooks/whatsapp → ${res.status} ${await res.text()}`);
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
