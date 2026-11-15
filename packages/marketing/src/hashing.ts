import { createHash } from 'node:crypto';
import type { AdProvider } from '@oneohm/domain';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Digits only, with the country code: "+91 98765-43210" → "919876543210". A number written
 * without "+" and 10 digits long is Indian; one with "+" already carries its own country code.
 */
export function phoneDigits(phone: string): string {
  const international = phone.trim().startsWith('+');
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  return !international && digits.length === 10 ? `91${digits}` : digits;
}

/**
 * The SHA-256 of a phone as each platform wants it normalised before hashing: Meta takes the
 * digits with the country code and no "+"; Google takes E.164 with the "+".
 */
export function hashPhoneFor(provider: AdProvider, phone: string): string {
  const digits = phoneDigits(phone);
  return sha256(provider === 'google' ? `+${digits}` : digits);
}

/** An email trimmed and in lower case, hashed (both platforms); null when empty. */
export function hashEmail(email: string | null | undefined): string | null {
  const clean = email?.trim().toLowerCase();
  return clean ? sha256(clean) : null;
}

/** A city in lower case without spaces or symbols, hashed (Meta `ct`). */
export function hashCity(city: string | null | undefined): string | null {
  const clean = city?.toLowerCase().replace(/[^a-z]/g, '');
  return clean ? sha256(clean) : null;
}
