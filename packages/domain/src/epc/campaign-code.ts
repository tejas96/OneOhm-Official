/** Words that follow "oneohm" in an ordinary greeting or menu request, never a campaign code. */
const NOT_CODES = new Set(['menu', 'hi', 'hii', 'hello', 'hey', 'start', 'help', 'code']);

/**
 * The campaign code in an ad's pre-filled opener: "Hi OneOhm DIWALI26", "hello oneohm poster-1"
 * or "oneohm DIWALI26". The whole message must be that opener, so "my code AB12CD" and "hi" are
 * not codes. Returned uppercase; null when there is none. An unknown code is still returned.
 */
export function findCampaignCode(text: string): string | null {
  const match = /^(?:(?:hi|hello|hey)[\s,]+)?oneohm[\s,]+([A-Za-z0-9_-]{2,20})[\s.!]*$/i.exec(
    text.trim(),
  );
  const code = match?.[1];
  if (!code || NOT_CODES.has(code.toLowerCase())) return null;
  return code.toUpperCase();
}
