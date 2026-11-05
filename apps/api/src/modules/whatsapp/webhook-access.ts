import { createHmac, timingSafeEqual } from 'node:crypto';

/** Meta signs each webhook post: `sha256=` and the HMAC of the raw body with the app secret. */
export function verifyMetaSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(header.slice('sha256='.length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Who may post to the webhook. With the app secret, every post must carry Meta's
 * signature. Until the secret is known, a long random key in the URL stands in: it is
 * weaker (anyone holding the link could post), so the secret always wins once set.
 */
export function webhookAccess(
  settings: { readonly appSecret?: string | undefined; readonly pathKey?: string | undefined },
  request: {
    readonly key?: string | undefined;
    readonly rawBody?: Buffer | undefined;
    readonly signature?: string | undefined;
  },
): 'ok' | 'not_found' | 'bad_signature' {
  if (settings.appSecret) {
    if (!request.rawBody) return 'bad_signature';
    return verifyMetaSignature(request.rawBody, request.signature, settings.appSecret)
      ? 'ok'
      : 'bad_signature';
  }
  if (settings.pathKey && request.key && sameText(settings.pathKey, request.key)) return 'ok';
  return 'not_found';
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
