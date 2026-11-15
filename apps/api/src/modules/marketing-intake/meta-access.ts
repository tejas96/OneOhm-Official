import { timingSafeEqual } from 'node:crypto';
import { verifyMetaSignature } from '../whatsapp/webhook-access';

/** The Meta app secret and verify token: the Meta ones, else the WhatsApp ones. */
export function metaSecrets(env: {
  readonly META_APP_SECRET?: string | undefined;
  readonly WHATSAPP_APP_SECRET?: string | undefined;
  readonly META_WEBHOOK_VERIFY_TOKEN?: string | undefined;
  readonly WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string | undefined;
}) {
  return {
    appSecret: env.META_APP_SECRET || env.WHATSAPP_APP_SECRET || undefined,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || undefined,
  };
}

/**
 * Whether a post is really Meta's. Without a secret nothing is accepted (never unsigned):
 * the webhook does not exist yet.
 */
export function metaPostAccess(
  appSecret: string | undefined,
  rawBody: Buffer | undefined,
  signature: string | undefined,
): 'ok' | 'not_found' | 'bad_signature' {
  if (!appSecret) return 'not_found';
  if (!rawBody) return 'bad_signature';
  return verifyMetaSignature(rawBody, signature, appSecret) ? 'ok' : 'bad_signature';
}

/** The one-time check Meta makes when the webhook is set up: the challenge, or why not. */
export function metaVerify(
  verifyToken: string | undefined,
  query: { mode?: string | undefined; token?: string | undefined; challenge?: string | undefined },
): { ok: true; challenge: string } | { ok: false; status: 403 | 404 } {
  if (!verifyToken) return { ok: false, status: 404 };
  if (query.mode !== 'subscribe' || !query.challenge || !sameText(verifyToken, query.token))
    return { ok: false, status: 403 };
  return { ok: true, challenge: query.challenge };
}

/** Equal text, compared in constant time. */
export function sameText(expected: string, given: string | undefined): boolean {
  if (given === undefined) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  return left.length === right.length && timingSafeEqual(left, right);
}
