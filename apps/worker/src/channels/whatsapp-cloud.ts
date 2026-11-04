import type { WorkerConfig } from '../config';
import { maskPhone, withoutLinks } from './log-mask';
import { metaSendFailure, whenNoAnswer } from './send-errors';
import { type SessionMessage, sessionRequestBody } from './session-message';

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

export { type SessionMessage, sessionRequestBody };

export type SendResult =
  | { readonly outcome: 'sent'; readonly providerId: string | null }
  | { readonly outcome: 'logged'; readonly note?: string };

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
    let response: Response;
    let body: { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      body = (await response.json().catch(() => ({}))) as typeof body;
    } catch (error) {
      throw whenNoAnswer(error);
    }
    if (response.ok) return { outcome: 'sent', providerId: body.messages?.[0]?.id ?? null };
    throw metaSendFailure(response.status, body.error);
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
