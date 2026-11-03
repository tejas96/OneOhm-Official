import {
  CITY_OTHER_CHOICE,
  type OnboardingSettings,
  type OnboardStep,
  parseAnswer,
} from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';

/** What one message says for the question the chat is on. */
export type ReadAnswer =
  | { readonly kind: 'value'; readonly value: unknown }
  /** "Change" or "Other city": the bot now waits for the name or city typed. */
  | { readonly kind: 'await'; readonly what: 'name' | 'city' }
  /** Unclear: asked again more simply, and a second miss goes to a person. */
  | { readonly kind: 'miss' };

const MISS: ReadAnswer = { kind: 'miss' };
const value = (answer: unknown): ReadAnswer => ({ kind: 'value', value: answer });

const YES = new Set(['yes', 'y', 'ok', 'okay', 'ho', 'haan', 'हो', 'होय', 'हां', 'हाँ']);
const NOT_NAME = new Set(['no', 'change', 'nahi', 'नाही', 'नहीं', 'बदला', 'बदलें']);

/** Words at the name question that ask for a different name ("Change"). */
export const changesName = (word: string) => NOT_NAME.has(word);

/**
 * Reads a tap or typed words as the answer to `step`, on top of the domain's parseAnswer:
 * the name question offers the WhatsApp name (Yes / Change), and after "Other city" (or
 * with no city list) the words are the city as typed, digits included.
 */
export function readAnswer(
  step: OnboardStep,
  input: { readonly choiceId: string | null; readonly text: string },
  view: {
    readonly settings: OnboardingSettings;
    readonly profileName: string | null;
    readonly awaiting: 'name' | 'city' | undefined;
  },
): ReadAnswer {
  const { choiceId, text } = input;
  if (step === 'name') return readName(choiceId, text, view);
  const typedCity = view.awaiting === 'city' || view.settings.serviceCities.length === 0;
  if (step === 'city' && !choiceId && typedCity) {
    const city = text.replace(/\s+/g, ' ');
    return city.length >= 2 && city.length <= 40 ? value(city) : MISS;
  }
  const parsed = parseAnswer(step, { choiceId, text }, view.settings);
  if (!parsed.ok) return MISS;
  return parsed.value === CITY_OTHER_CHOICE ? { kind: 'await', what: 'city' } : value(parsed.value);
}

function readName(
  choiceId: string | null,
  text: string,
  view: Parameters<typeof readAnswer>[2],
): ReadAnswer {
  const profile = view.profileName?.trim();
  const typing = view.awaiting === 'name' || !profile;
  const word = text.toLowerCase();
  if (choiceId === 'ob:name:change' || (!typing && !choiceId && NOT_NAME.has(word)))
    return { kind: 'await', what: 'name' };
  if (choiceId === 'ob:name:yes' || (!typing && !choiceId && YES.has(word)))
    return profile ? value(titleCaseName(profile)) : { kind: 'await', what: 'name' };
  if (choiceId) return MISS;
  const parsed = parseAnswer('name', { choiceId: null, text }, view.settings);
  return parsed.ok ? value(titleCaseName(String(parsed.value))) : MISS;
}
