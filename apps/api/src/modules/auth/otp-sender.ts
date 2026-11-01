import { Logger } from '@nestjs/common';
import type { Environment } from '../../config/environment';

export interface OtpSender {
  send(phoneE164: string, code: string): Promise<void>;
}

/** Development: the code goes to the API log only. */
class LocalOtpSender implements OtpSender {
  private readonly logger = new Logger('OTP');
  async send(phoneE164: string, code: string): Promise<void> {
    this.logger.log(`One-time code for ${phoneE164}: ${code} (local development only)`);
  }
}

/** MSG91 OTP API with the DLT-registered login template. */
class Msg91OtpSender implements OtpSender {
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
  ) {}

  async send(phoneE164: string, code: string): Promise<void> {
    const mobile = phoneE164.replace(/^\+/, '');
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', this.templateId);
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('otp', code);
    const response = await fetch(url, {
      method: 'POST',
      headers: { authkey: this.authKey, 'content-type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`MSG91 answered ${response.status}`);
  }
}

export function createOtpSender(env: Environment): OtpSender {
  if (env.OTP_PROVIDER === 'msg91') {
    if (!env.MSG91_AUTH_KEY || !env.MSG91_LOGIN_TEMPLATE_ID) {
      throw new Error('OTP_PROVIDER=msg91 needs MSG91_AUTH_KEY and MSG91_LOGIN_TEMPLATE_ID.');
    }
    return new Msg91OtpSender(env.MSG91_AUTH_KEY, env.MSG91_LOGIN_TEMPLATE_ID);
  }
  return new LocalOtpSender();
}
