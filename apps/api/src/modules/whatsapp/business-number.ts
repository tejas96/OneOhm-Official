import type { Environment } from '../../config/environment';

const HOUR_MS = 3600 * 1000;
let cached: { readonly number: string | null; readonly at: number } | null = null;

/** "+91 98000 00000" → "+919800000000"; anything that is not a number gives null. */
export function toE164Digits(display: string | null | undefined): string | null {
  const digits = (display ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? `+${digits}` : null;
}

/**
 * The business WhatsApp number customers should write to, so every chat lands in the
 * OneOhm inbox. Set WHATSAPP_BUSINESS_NUMBER to fix it; otherwise it is read from Meta
 * once an hour. Null when WhatsApp is not connected, so callers fall back to a phone.
 */
export async function businessWhatsAppNumber(env: Environment): Promise<string | null> {
  if (env.WHATSAPP_BUSINESS_NUMBER) return env.WHATSAPP_BUSINESS_NUMBER;
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return null;
  if (cached && Date.now() - cached.at < HOUR_MS) return cached.number;
  try {
    const response = await fetch(
      `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number`,
      {
        headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    const body = (await response.json()) as { display_phone_number?: string };
    cached = {
      number: response.ok ? toE164Digits(body.display_phone_number) : null,
      at: Date.now(),
    };
  } catch {
    // Meta unreachable: try again on the next call rather than caching a miss for an hour.
    return cached?.number ?? null;
  }
  return cached.number;
}
