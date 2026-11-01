import type { WorkerConfig } from '../config';

export interface WhatsAppTemplateMessage {
  readonly toE164: string;
  readonly template: string;
  readonly language: string;
  readonly parameters: readonly string[];
}

export type SendResult =
  | { readonly outcome: 'sent'; readonly providerId: string | null }
  | { readonly outcome: 'logged' };

/** A send that will never succeed as is (bad number, unknown template): do not retry. */
export class PermanentSendError extends Error {}

/** Builds the Cloud API body for a template message. Numbers go without the "+". */
export function templateRequestBody(message: WhatsAppTemplateMessage) {
  return {
    messaging_product: 'whatsapp',
    to: message.toE164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: message.template,
      language: { code: message.language },
      components: [
        {
          type: 'body',
          parameters: message.parameters.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  };
}

/** Rate limits and server errors are worth retrying; other client errors are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface WhatsAppSender {
  send(message: WhatsAppTemplateMessage): Promise<SendResult>;
}

export function createWhatsAppSender(
  config: WorkerConfig,
  log: (line: string) => void,
): WhatsAppSender {
  if (config.WHATSAPP_DELIVERY === 'log') {
    return {
      async send(message) {
        log(
          `[whatsapp:log] ${message.template} → ${message.toE164} ${JSON.stringify(message.parameters)}`,
        );
        return { outcome: 'logged' };
      },
    };
  }
  const url = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  return {
    async send(message) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(templateRequestBody(message)),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string; code?: number };
      };
      if (response.ok) return { outcome: 'sent', providerId: body.messages?.[0]?.id ?? null };
      const reason = `WhatsApp ${response.status}: ${body.error?.message ?? 'request failed'}`;
      if (isRetryableStatus(response.status)) throw new Error(reason);
      throw new PermanentSendError(reason);
    },
  };
}
