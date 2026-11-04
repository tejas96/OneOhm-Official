import { type PayToken, readPayToken, signPayToken } from '@oneohm/shared/pay-token';
import type { Environment } from '../../config/environment';

/** The signing lives in @oneohm/shared so the worker signs reminder links the same way. */
export { type PayToken, readPayToken, signPayToken };

type PaySecrets = Pick<Environment, 'FILE_LINK_SECRET' | 'PAY_LINK_SECRET'>;

/** New pay links are signed with their own secret; the file secret stands in when unset. */
export function paySigningSecret(env: PaySecrets): string {
  return env.PAY_LINK_SECRET ?? env.FILE_LINK_SECRET;
}

/** Also reads links signed with the file secret, so ones already in customers' chats work. */
export function readPayTokenFor(env: PaySecrets, value: string, now = Date.now()): PayToken | null {
  return (
    readPayToken(paySigningSecret(env), value, now) ??
    readPayToken(env.FILE_LINK_SECRET, value, now)
  );
}
