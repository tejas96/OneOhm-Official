export type SignInIdentifier =
  | { kind: 'email'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'phone'; value: string };

/** An Indian mobile number as typed: 10 digits, 0 + 10 digits, or 91 + 10 digits. */
const MOBILE = /^(?:0|91)?([6-9]\d{9})$/;

/**
 * What the web sign-in box holds: anything with "@" is an email; digits that make an
 * Indian mobile number become E.164 (the form stored in users.phone_e164); the rest is an
 * employee code. Emails and codes are lowercased, as the lookups compare them.
 */
export function parseIdentifier(raw: string): SignInIdentifier {
  const value = raw.trim().toLowerCase();
  if (value.includes('@')) return { kind: 'email', value };
  const mobile = MOBILE.exec(value.replace(/[\s-]/g, '').replace(/^\+/, ''));
  if (mobile) return { kind: 'phone', value: `+91${mobile[1]}` };
  return { kind: 'code', value };
}
