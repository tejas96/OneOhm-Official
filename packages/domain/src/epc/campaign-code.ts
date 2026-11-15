/** Words that follow "oneohm" in an ordinary greeting or menu request, never a campaign code. */
const NOT_CODES = new Set(['menu', 'hi', 'hii', 'hello', 'hey', 'start', 'help', 'code']);

/** True for a word that can never be a campaign code: saved, it would never match. */
export function isReservedCampaignWord(code: string): boolean {
  return NOT_CODES.has(code.trim().toLowerCase());
}

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
  const match =
    /^(?:(?:hi|hello|hey)[\s,]+)?oneohm[\s,]+([A-Za-z0-9_-]{2,20})(?:[\s,]+#[a-z0-9]{4,10})?[\s.!]*$/i.exec(
      text.trim(),
    );
  const word = match?.[1];
  if (!word || NOT_CODES.has(word.toLowerCase())) return null;
  const code = word.toUpperCase();
  return /[0-9_-]/.test(code) || known?.has(code) ? code : null;
}

/**
 * The landing-page click a WhatsApp opener carries ("Hi OneOhm SOLAR-01 #k3f9q2"), lower case,
 * so the chat finds the Google or Meta click that sent it. Null when there is none.
 */
export function findClickRef(text: string): string | null {
  const match =
    /^(?:(?:hi|hello|hey)[\s,]+)?oneohm[\s,]+[A-Za-z0-9_-]{2,20}[\s,]+#([a-z0-9]{4,10})[\s.!]*$/i.exec(
      text.trim(),
    );
  return match?.[1]?.toLowerCase() ?? null;
}
