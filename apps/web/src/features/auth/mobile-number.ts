/** "98765 43210", "+91 98765-43210" → "+919876543210"; null when it is not an Indian mobile. */
export function toIndianMobile(raw: string): string | null {
  const compact = raw.trim().replace(/[\s-]/g, '');
  if (!/^(\+91)?[6-9]\d{9}$/.test(compact)) return null;
  return compact.startsWith('+91') ? compact : `+91${compact}`;
}

/** The digits of a typed or pasted code, at most six. */
export const codeDigits = (raw: string) => raw.replace(/\D/g, '').slice(0, 6);
