/**
 * A person's name as we write it to them: each lower-case word gets a capital first
 * letter ("tejas patil" → "Tejas Patil"), across hyphens too. Words that already carry a
 * capital, and scripts without case (Devanagari), stay exactly as typed.
 */
export function titleCaseName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s-])(\p{Ll})(\p{L}*)/gu, (whole, before: string, first: string, rest: string) =>
      rest === rest.toLowerCase() ? `${before}${first.toUpperCase()}${rest}` : whole,
    );
}
