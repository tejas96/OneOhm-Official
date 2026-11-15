/** Words too plain to name a campaign code on their own. */
const FILLER = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'get',
  'in',
  'is',
  'now',
  'of',
  'on',
  'our',
  'the',
  'to',
  'with',
  'your',
  'you',
]);

/**
 * A short code people can type ("Hi OneOhm SOLAR-26"): the first strong word of the text in
 * capitals, a dash, and two digits that make it unique among `taken`. Always 2 to 20 characters
 * of A-Z, 0-9 and dashes, so `findCampaignCode` reads it back.
 */
export function campaignCodeFrom(text: string, taken: ReadonlySet<string>): string {
  const words = text
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !FILLER.has(word.toLowerCase()));
  const stem = (words[0] ?? 'AD').toUpperCase().slice(0, 12);
  for (let number = 1; number < 1000; number += 1) {
    const code = `${stem}-${String(number).padStart(2, '0')}`;
    if (!taken.has(code)) return code;
  }
  return `${stem}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** The first line of the text, as a headline of at most `max` characters (cut on a word). */
export function headlineOf(text: string, max = 40): string {
  const first = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
  return cutOnWord(first, max);
}

/** The text after its first line; the whole text when it is one line. */
export function bodyOf(text: string): string {
  const lines = text.trim().split(/\r?\n/);
  const rest = lines.slice(1).join('\n').trim();
  return rest || text.trim();
}

/** `text` cut to at most `max` characters, on a word when it can, with no trailing dots. */
export function cutOnWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!-]+$/, '');
}

/** A campaign name for the list: the headline, or the code when the text is empty. */
export function campaignNameOf(text: string, code: string): string {
  return headlineOf(text, 60) || code;
}

/**
 * The Indian mobile number in a message ("my no is 98765 43210", "+91-98765-43210"), as E.164,
 * or null. Only a 10-digit mobile starting 6-9 counts, so pincodes and amounts never match.
 */
export function findIndianMobile(text: string): string | null {
  const squeezed = text.replace(/(?<=\d)[\s.-](?=\d)/g, '');
  const match = /(?:^|[^\d])(?:\+?91|0)?([6-9]\d{9})(?!\d)/.exec(squeezed);
  return match?.[1] ? `+91${match[1]}` : null;
}
