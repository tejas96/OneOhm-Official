import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SharedFile {
  /** `report` links point at a project (`id`) and name the report in `key`. */
  readonly kind: 'quotation' | 'receipt' | 'document' | 'invoice' | 'report';
  readonly id: string;
  readonly customerId: string;
  /** Seconds since 1970 when the link stops working. */
  readonly exp: number;
  /** Which statutory report, for `report` links only. */
  readonly key?: string;
}

const sign = (secret: string, data: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

/** A link that opens one of the customer's files without signing in, until it expires. */
export function signFileLink(secret: string, file: SharedFile): string {
  const data = Buffer.from(JSON.stringify(file)).toString('base64url');
  return `${data}.${sign(secret, data)}`;
}

/** The file a link points to, or null when it was altered or has expired. */
export function readFileLink(secret: string, token: string, now = Date.now()): SharedFile | null {
  const [data, mac] = token.split('.');
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(secret, data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const file = JSON.parse(Buffer.from(data, 'base64url').toString()) as SharedFile;
    return file.exp * 1000 > now ? file : null;
  } catch {
    return null;
  }
}
