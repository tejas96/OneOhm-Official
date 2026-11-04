import { isRetryableStatus, PermanentSendError } from './send-errors';
import type { SendResult } from './whatsapp-cloud';

/** Customer SMS for people not on WhatsApp. "log" (the default) never texts anyone. */
export interface SmsSender {
  send(toE164: string, text: string): Promise<SendResult>;
}

export interface SmsConfig {
  readonly SMS_DELIVERY: 'log' | 'msg91';
  readonly MSG91_AUTH_KEY?: string | undefined;
  /** A DLT-approved MSG91 flow template whose one variable is ##message##. */
  readonly MSG91_SMS_TEMPLATE_ID?: string | undefined;
}

export function createSmsSender(config: SmsConfig, log: (line: string) => void): SmsSender {
  if (config.SMS_DELIVERY === 'log') {
    return {
      async send(toE164, text) {
        log(`[sms:log] → ${toE164} ${text}`);
        return { outcome: 'logged' };
      },
    };
  }
  return {
    async send(toE164, text) {
      const response = await fetch('https://control.msg91.com/api/v5/flow', {
        method: 'POST',
        headers: { authkey: config.MSG91_AUTH_KEY ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({
          template_id: config.MSG91_SMS_TEMPLATE_ID,
          short_url: '0',
          recipients: [{ mobiles: toE164.replace(/^\+/, ''), message: text }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as {
        type?: string;
        message?: string;
      };
      if (response.ok && body.type !== 'error') {
        return { outcome: 'sent', providerId: body.message ?? null };
      }
      const reason = `SMS ${response.status}: ${body.message ?? 'request failed'}`;
      if (isRetryableStatus(response.status)) throw new Error(reason);
      throw new PermanentSendError(reason);
    },
  };
}
