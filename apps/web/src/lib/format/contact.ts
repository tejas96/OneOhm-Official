/** "+919876543210" → "+91 98765 43210"; anything else is returned as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return match ? `+91 ${match[1]} ${match[2]}` : e164;
}

/** A WhatsApp chat link for an Indian number stored as E.164. */
export function whatsappHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}`;
}

/** The same person or customer keeps the same avatar colour everywhere. */
export function swatchFor(id: string): number {
  let sum = 0;
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 997;
  return sum;
}
