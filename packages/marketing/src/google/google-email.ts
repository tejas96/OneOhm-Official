import { hashEmail } from '../hashing';

const GMAIL = new Set(['gmail.com', 'googlemail.com']);

/**
 * Google's way to write an email before hashing: trimmed, lower case, and for Gmail the dots
 * and the "+tag" in the name part are removed.
 */
export function googleEmailForm(email: string | null | undefined): string | null {
  const clean = email?.trim().toLowerCase();
  if (!clean) return null;
  const at = clean.lastIndexOf('@');
  if (at < 1) return clean;
  const domain = clean.slice(at + 1);
  if (!GMAIL.has(domain)) return clean;
  const name = clean.slice(0, at).split('+')[0]?.replace(/\./g, '') ?? '';
  return `${name}@${domain}`;
}

/** The hash Google matches on, or null when there is no email. */
export function googleEmailHash(email: string | null | undefined): string | null {
  return hashEmail(googleEmailForm(email));
}
