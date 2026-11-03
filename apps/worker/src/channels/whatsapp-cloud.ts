import type { WorkerConfig } from '../config';
import { maskPhone, withoutLinks } from './log-mask';

/** A file shown at the top of a template message. */
export interface TemplateHeader {
  readonly kind: 'document';
  readonly link: string;
  readonly filename: string;
}

/** A button on a template, by its position (index) in the approved template. */
export type TemplateButton =
  | { readonly kind: 'quick_reply'; readonly index: number; readonly payload: string }
  | { readonly kind: 'url'; readonly index: number; readonly suffix: string };

export interface WhatsAppTemplateMessage {
  readonly toE164: string;
  readonly template: string;
  readonly language: string;
  readonly parameters: readonly string[];
  readonly header?: TemplateHeader;
  readonly buttons?: readonly TemplateButton[];
}

export type SendResult =
  | { readonly outcome: 'sent'; readonly providerId: string | null }
  | { readonly outcome: 'logged'; readonly note?: string };

/** A send that will never succeed as is (bad number, unknown template): do not retry. */
export class PermanentSendError extends Error {
  /** The provider's own error code, e.g. Meta's 131026 for "not on WhatsApp". */
  constructor(
    message: string,
    readonly code: number | null = null,
  ) {
    super(message);
  }
}

function buttonComponent(button: TemplateButton) {
  return {
    type: 'button',
    sub_type: button.kind,
    index: String(button.index),
    parameters:
      button.kind === 'quick_reply'
        ? [{ type: 'payload', payload: button.payload }]
        : [{ type: 'text', text: button.suffix }],
  };
}

/** Builds the Cloud API body for a template message. Numbers go without the "+". */
export function templateRequestBody(message: WhatsAppTemplateMessage) {
  const header = message.header
    ? [
        {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: { link: message.header.link, filename: message.header.filename },
            },
          ],
        },
      ]
    : [];
  return {
    messaging_product: 'whatsapp',
    to: message.toE164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: message.template,
      language: { code: message.language },
      components: [
        ...header,
        {
          type: 'body',
          parameters: message.parameters.map((text) => ({ type: 'text', text })),
        },
        ...(message.buttons ?? []).map(buttonComponent),
      ],
    },
  };
}

/** A reply inside the 24-hour window after the customer wrote: no template needed. */
export type SessionMessage =
  | { readonly kind: 'text'; readonly body: string }
  | {
      readonly kind: 'buttons';
      readonly body: string;
      readonly buttons: readonly { readonly id: string; readonly title: string }[];
    }
  | {
      readonly kind: 'document';
      readonly link: string;
      readonly filename: string;
      readonly caption?: string;
    }
  | {
      readonly kind: 'cta_url';
      readonly body: string;
      /** Meta cuts the button label at 20 characters. */
      readonly label: string;
      readonly url: string;
    }
  | {
      readonly kind: 'list';
      readonly body: string;
      readonly button: string;
      /** The heading over the rows, such as the company's name; none when left out. */
      readonly section?: string;
      readonly rows: readonly {
        readonly id: string;
        readonly title: string;
        readonly description?: string;
      }[];
    };

/** Builds the Cloud API body for a text, file, link-button, reply-buttons or list message. */
export function sessionRequestBody(toE164: string, message: SessionMessage) {
  const to = toE164.replace(/^\+/, '');
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (message.kind === 'text')
    return { ...base, type: 'text', text: { preview_url: true, body: message.body } };
  if (message.kind === 'document')
    return {
      ...base,
      type: 'document',
      document: {
        link: message.link,
        filename: message.filename,
        ...(message.caption ? { caption: message.caption } : {}),
      },
    };
  if (message.kind === 'cta_url')
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: message.body },
        action: {
          name: 'cta_url',
          parameters: { display_text: message.label.slice(0, 20), url: message.url },
        },
      },
    };
  if (message.kind === 'buttons')
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message.body },
        action: {
          buttons: message.buttons.map((button) => ({ type: 'reply', reply: button })),
        },
      },
    };
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: message.body },
      action: {
        button: message.button,
        // One section needs no title (Meta's rule); a title is kept to 24 characters.
        sections: [
          message.section
            ? { title: message.section.slice(0, 24), rows: message.rows }
            : { rows: message.rows },
        ],
      },
    },
  };
}

/** Rate limits and server errors are worth retrying; other client errors are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface WhatsAppSender {
  send(message: WhatsAppTemplateMessage): Promise<SendResult>;
  sendSession(toE164: string, message: SessionMessage): Promise<SendResult>;
}

export function createWhatsAppSender(
  config: WorkerConfig,
  log: (line: string) => void,
): WhatsAppSender {
  if (config.WHATSAPP_DELIVERY === 'log') {
    return {
      async send(message) {
        const header = message.header ? ` header=${message.header.filename}` : '';
        const buttons = (message.buttons ?? []).map((b) =>
          b.kind === 'quick_reply' ? b.payload : '[link]',
        );
        log(
          `[whatsapp:log] ${message.template} → ${maskPhone(message.toE164)} ${withoutLinks(JSON.stringify(message.parameters))}${header}${buttons.length > 0 ? ` buttons=${JSON.stringify(buttons)}` : ''}`,
        );
        return { outcome: 'logged' };
      },
      async sendSession(toE164, message) {
        const what = message.kind === 'document' ? message.filename : message.body;
        log(
          `[whatsapp:log] ${message.kind} → ${maskPhone(toE164)} ${withoutLinks(JSON.stringify(what))}`,
        );
        return { outcome: 'logged' };
      },
    };
  }
  const url = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const post = async (payload: unknown): Promise<SendResult> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    };
    if (response.ok) return { outcome: 'sent', providerId: body.messages?.[0]?.id ?? null };
    const reason = `WhatsApp ${response.status}: ${body.error?.message ?? 'request failed'}`;
    if (isRetryableStatus(response.status)) throw new Error(reason);
    throw new PermanentSendError(reason, body.error?.code ?? null);
  };
  // Testing live: numbers outside the list are only logged, never messaged.
  const allowed = config.WHATSAPP_TEST_NUMBERS;
  const held = (to: string, what: string): SendResult | null => {
    if (allowed.length === 0 || allowed.includes(to)) return null;
    log(`[whatsapp:test] held ${what} → ${maskPhone(to)} (not in WHATSAPP_TEST_NUMBERS)`);
    return { outcome: 'logged', note: 'Not sent: only test numbers get messages right now.' };
  };
  return {
    send: async (message) =>
      held(message.toE164, message.template) ?? post(templateRequestBody(message)),
    sendSession: async (toE164, message) =>
      held(toE164, message.kind) ?? post(sessionRequestBody(toE164, message)),
  };
}
