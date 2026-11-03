/** Log lines must not leak personal data: phones show their last 4 digits, links are dropped. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${phone.startsWith('+') ? '+' : ''}•••••${digits.slice(-4)}`;
}

/** Signed links carry tokens, so no URL is ever written to a log. */
export function withoutLinks(text: string): string {
  return text.replace(/https?:\/\/[^\s"]+/g, '[link]');
}
