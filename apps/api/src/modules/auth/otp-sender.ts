import { Logger } from '@nestjs/common';
import type { Environment } from '../../config/environment';

export type OtpPurpose = 'login' | 'password_reset';

export interface OtpSender {
  send(phoneE164: string, code: string, purpose: OtpPurpose): Promise<void>;
}

/** Each purpose has its own DLT-registered template. */
export function templateIdFor(
  env: Pick<Environment, 'MSG91_LOGIN_TEMPLATE_ID' | 'MSG91_PASSWORD_RESET_TEMPLATE_ID'>,
  purpose: OtpPurpose,
): string {
  const id =
    purpose === 'password_reset'
      ? env.MSG91_PASSWORD_RESET_TEMPLATE_ID
      : env.MSG91_LOGIN_TEMPLATE_ID;
  if (!id) throw new Error(`No MSG91 template is set for ${purpose}.`);
  return id;
}

/** Development: the code goes to the API log only. */
class LocalOtpSender implements OtpSender {
  private readonly logger = new Logger('OTP');
  async send(phoneE164: string, code: string, purpose: OtpPurpose): Promise<void> {
    this.logger.log(
      `One-time code (${purpose}) for ${phoneE164}: ${code} (local development only)`,
    );
  }
}

/** MSG91 OTP API with the DLT-registered login and password-reset templates. */
class Msg91OtpSender implements OtpSender {
  constructor(
    private readonly authKey: string,
    private readonly templates: Pick<
      Environment,
      'MSG91_LOGIN_TEMPLATE_ID' | 'MSG91_PASSWORD_RESET_TEMPLATE_ID'
    >,
  ) {}

  async send(phoneE164: string, code: string, purpose: OtpPurpose): Promise<void> {
    const mobile = phoneE164.replace(/^\+/, '');
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', templateIdFor(this.templates, purpose));
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
    if (
      !env.MSG91_AUTH_KEY ||
      !env.MSG91_LOGIN_TEMPLATE_ID ||
      !env.MSG91_PASSWORD_RESET_TEMPLATE_ID
    ) {
      throw new Error(
        'OTP_PROVIDER=msg91 needs MSG91_AUTH_KEY, MSG91_LOGIN_TEMPLATE_ID and MSG91_PASSWORD_RESET_TEMPLATE_ID.',
      );
    }
    return new Msg91OtpSender(env.MSG91_AUTH_KEY, env);
  }
  return new LocalOtpSender();
}
