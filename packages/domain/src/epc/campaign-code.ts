/** Words that follow "oneohm" in an ordinary greeting or menu request, never a campaign code. */
const NOT_CODES = new Set(['menu', 'hi', 'hii', 'hello', 'hey', 'start', 'help', 'code']);

/**
 * The campaign code in an ad's pre-filled opener: "Hi OneOhm DIWALI26", "hello oneohm poster-1"
 * or "oneohm DIWALI26". The whole message must be that opener, so "my code AB12CD" and "hi" are
 * not codes. Returned uppercase; null when there is none.
 *
 * A plain word ("Hello OneOhm sir", "oneohm please") is a greeting, not a code, unless it
 * is on the Ad and campaign codes list (`known`, uppercase). A word with a digit, a dash or
 * an underscore is taken as a code even when it is not listed yet.
 */
export function findCampaignCode(text: string, known?: ReadonlySet<string>): string | null {
  const match = /^(?:(?:hi|hello|hey)[\s,]+)?oneohm[\s,]+([A-Za-z0-9_-]{2,20})[\s.!]*$/i.exec(
    text.trim(),
  );
  const word = match?.[1];
  if (!word || NOT_CODES.has(word.toLowerCase())) return null;
  const code = word.toUpperCase();
  return /[0-9_-]/.test(code) || known?.has(code) ? code : null;
}
