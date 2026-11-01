/**
 * A customer's referral code (PRD 5.6): short, easy to read aloud and type, and the same
 * forever. Up to four letters of the first name, then four characters without the ones
 * people mix up (0/O, 1/I/L).
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const SUFFIX = 4;

export function makeReferralCode(name: string, random: () => number = Math.random): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const letters = first
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 4);
  const prefix = letters.length >= 2 ? letters : 'OH';
  let suffix = '';
  for (let index = 0; index < SUFFIX; index += 1) {
    suffix += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return `${prefix}${suffix}`;
}

/** Upper case, letters and digits only: "rame-7k2q" and "RAME 7K2Q" are the same code. */
export function normaliseReferralCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isReferralCodeShape(code: string): boolean {
  return /^[A-Z0-9]{6,8}$/.test(code);
}

/**
 * The code in a message such as "Hi OneOhm, my referral code is RAME7K2Q", or null.
 * Only text right after the word "code" counts, so ordinary words are never codes.
 */
export function findReferralCode(text: string): string | null {
  const match = /\bcode\b(?:\s+is)?[\s:#-]*([A-Za-z0-9]{6,8})\b/i.exec(text);
  if (!match?.[1]) return null;
  const code = normaliseReferralCode(match[1]);
  return isReferralCodeShape(code) ? code : null;
}
