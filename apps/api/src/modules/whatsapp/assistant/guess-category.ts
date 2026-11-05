/** A name and a 10-digit Indian mobile from one message, or null. */
export function readReferral(text: string): { name: string; phone: string } | null {
  const match = text.match(/(?:\+?91[\s-]?)?([6-9](?:[\s-]?\d){9})(?!\d)/);
  if (!match?.[1]) return null;
  const name = text
    .replace(match[0], ' ')
    .replace(/[^\p{L}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name.length >= 2 ? { name, phone: `+91${match[1].replace(/\D/g, '')}` } : null;
}
