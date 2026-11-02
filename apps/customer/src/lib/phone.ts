/**
 * A 10-digit Indian mobile number from what was typed: spaces, hyphens and a leading
 * +91 or 0 are dropped. Null when what is left is not 10 digits starting 6-9.
 */
export function indianMobile(typed: string): string | null {
  let digits = typed.trim().replace(/[\s-]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
