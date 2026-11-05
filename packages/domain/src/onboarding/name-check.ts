/**
 * Is this a name we may call a person by (redesign §16)? A WhatsApp profile name is often an
 * emoji, initials or a shop: those are refused and the person is asked to type theirs. At
 * least two letters, no digits or symbols, and no word that names a business (asking costs one typed line).
 */
const BUSINESS_WORDS = new Set([
  'solar',
  'energy',
  'power',
  'enterprises',
  'enterprise',
  'traders',
  'trading',
  'official',
  'store',
  'stores',
  'shop',
  'services',
  'service',
  'solutions',
  'pvt',
  'ltd',
  'industries',
  'electricals',
  'electric',
  'associates',
  'oneohm',
  'bot',
  'admin',
]);

export function usableName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 60) return null;
  // Letters, marks (Devanagari vowel signs), spaces and the dots, hyphens, quotes and brackets of real names.
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’()_,-]*$/u.test(name)) return null;
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return null;
  const words = name
    .toLowerCase()
    .split(/[\s.'’-]+/)
    .filter(Boolean);
  return words.some((word) => BUSINESS_WORDS.has(word)) ? null : name;
}
