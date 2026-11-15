import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** What the sign-in page hands back to us, so a callback can be trusted. */
export interface ConnectState {
  readonly provider: 'meta' | 'google';
  readonly userId: string;
  /** Unix milliseconds after which the state is refused. */
  readonly exp: number;
  readonly nonce: string;
}

/** A sign-in may take a while: the person logs in and ticks permissions. */
export const STATE_LIFETIME_MS = 15 * 60 * 1000;

const mac = (secret: string, body: string) =>
  createHmac('sha256', secret).update(body).digest('base64url');

/** `<base64url json>.<HMAC-SHA256>`, signed with the marketing secret key. */
export function signState(
  secret: string,
  input: { readonly provider: 'meta' | 'google'; readonly userId: string },
  now: number = Date.now(),
): string {
  const state: ConnectState = {
    ...input,
    exp: now + STATE_LIFETIME_MS,
    nonce: randomBytes(8).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  return `${body}.${mac(secret, body)}`;
}

/** The state when it is ours, unchanged and not expired; otherwise null. */
export function verifyState(
  secret: string,
  value: unknown,
  now: number = Date.now(),
): ConnectState | null {
  if (typeof value !== 'string') return null;
  const [body, signature, extra] = value.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const state = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ConnectState;
    const providerOk = state.provider === 'meta' || state.provider === 'google';
    if (!providerOk || typeof state.userId !== 'string' || typeof state.exp !== 'number')
      return null;
    return state.exp > now ? state : null;
  } catch {
    return null;
  }
}
