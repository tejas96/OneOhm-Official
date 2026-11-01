import { createHmac, timingSafeEqual } from 'node:crypto';

/** One customer's milestone, payable from a message link until it expires. */
export interface PayToken {
  readonly milestoneId: string;
  readonly customerId: string;
  /** Seconds since 1970 when the link stops working. */
  readonly exp: number;
}

const sign = (secret: string, data: string) =>
  createHmac('sha256', `pay:${secret}`).update(data).digest('base64url');

/**
 * A short OneOhm link for a due milestone (PRD 6.2 "payment milestone due"). Opening it
 * makes or reuses the Razorpay link then, so no gateway call happens while a task is saved.
 */
export function signPayToken(secret: string, token: PayToken): string {
  const data = Buffer.from(
    JSON.stringify([token.milestoneId, token.customerId, token.exp]),
  ).toString('base64url');
  return `${data}.${sign(secret, data)}`;
}

/** The milestone a link points to, or null when it was altered or has expired. */
export function readPayToken(secret: string, value: string, now = Date.now()): PayToken | null {
  const [data, mac] = value.split('.');
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(secret, data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [milestoneId, customerId, exp] = JSON.parse(
      Buffer.from(data, 'base64url').toString(),
    ) as [unknown, unknown, unknown];
    if (typeof milestoneId !== 'string' || typeof customerId !== 'string') return null;
    if (typeof exp !== 'number' || exp * 1000 <= now) return null;
    return { milestoneId, customerId, exp };
  } catch {
    return null;
  }
}
