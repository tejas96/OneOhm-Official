import type { BillBand, OnboardingSettings } from './settings';

export const STEP_ORDER = [
  'language',
  'name',
  'city',
  'site',
  'bill',
  'roof',
  'floors',
  'photo',
  'done',
] as const;
export type OnboardStep = (typeof STEP_ORDER)[number];

export type SiteChoice = 'home' | 'society' | 'business' | 'farm';
export type RoofChoice = 'rcc' | 'tin' | 'other';

export interface OnboardAnswers {
  language?: 'en' | 'mr' | 'hi';
  name?: string;
  city?: string;
  site?: SiteChoice;
  /** Id of the chosen bill band. */
  bill?: string;
  roof?: RoofChoice;
  floors?: 1 | 2 | 3;
  photo?: 'sent' | 'later';
}

export type Parsed<T> = { ok: true; value: T } | { ok: false };

/** The choice id of the "Other" city row; the bot then asks for the city as text. */
export const CITY_OTHER_CHOICE = 'ob:city:other';

const NO: Parsed<never> = { ok: false };
const yes = <T>(value: T): Parsed<T> => ({ ok: true, value });

/** Plain words a customer may type for each option, in English, Marathi and Hindi. */
const SYNONYMS: Record<string, readonly string[]> = {
  en: ['en', 'english', 'inglish', 'इंग्लिश', 'अंग्रेजी', 'अंग्रेज़ी'],
  mr: ['mr', 'marathi', 'मराठी'],
  hi: ['hi', 'hindi', 'हिंदी', 'हिन्दी'],
  home: ['home', 'house', 'flat', 'ghar', 'घर', 'बंगला', 'बंगलो'],
  society: ['society', 'housing', 'सोसायटी', 'सोसाइटी'],
  business: ['shop', 'business', 'office', 'factory', 'dukan', 'दुकान', 'व्यवसाय', 'व्यापार'],
  farm: ['farm', 'farming', 'shet', 'khet', 'शेत', 'खेत'],
  rcc: ['rcc', 'slab', 'concrete', 'स्लॅब', 'स्लैब', 'सिमेंट'],
  tin: ['tin', 'sheet', 'shed', 'patra', 'पत्रा', 'पत्र्याचे', 'टीन', 'शेड'],
  other: ['other', 'else', 'इतर', 'अन्य', 'दुसरा', 'दूसरा'],
  later: ['later', 'skip', 'no', 'नंतर', 'बाद', 'बाद में', 'नहीं', 'नाही'],
};

/** Options of the choice steps, in the order the bot lists them. */
const OPTIONS = {
  language: ['en', 'mr', 'hi'],
  site: ['home', 'society', 'business', 'farm'],
  roof: ['rcc', 'tin', 'other'],
  photo: ['sent', 'later'],
} as const;

const clean = (text: string): string => text.trim().replace(/\s+/g, ' ');
const norm = (text: string): string => clean(text).toLowerCase();

function matchOption<T extends string>(
  options: readonly T[],
  text: string,
  wordless: readonly T[] = [],
): Parsed<T> {
  const word = norm(text).replace(/[.!?,;:]+$/u, '');
  if (/^\d+$/.test(word)) {
    const picked = options[Number(word) - 1];
    return picked && !wordless.includes(picked) ? yes(picked) : NO;
  }
  const tokens = word.split(/[\s,.;:!?]+/u);
  for (const option of options) {
    const words = SYNONYMS[option] ?? [];
    if (words.includes(word) || tokens.some((token) => words.includes(token))) return yes(option);
  }
  return NO;
}

/** Highest-bill-first lookup: the band whose range holds the typed monthly amount. */
function bandFor(amount: number, bands: readonly BillBand[]): Parsed<string> {
  for (const band of bands) {
    if (typeof band.maxRupees === 'number' && amount <= band.maxRupees) return yes(band.id);
  }
  const open = bands.find((band) => band.maxRupees === null);
  return open ? yes(open.id) : NO;
}

function parseBillText(text: string, bands: readonly BillBand[]): Parsed<string> {
  const word = norm(text).replace(/[₹,\s]|rs\.?|inr/gu, '');
  const match = /^(\d+(?:\.\d+)?)(k?)$/u.exec(word);
  if (!match) return NO;
  const plain = /^\d+$/u.test(word);
  // A bare 1..n is the option number, as in every other list.
  if (plain && Number(word) <= bands.length) {
    const band = bands[Number(word) - 1];
    return band ? yes(band.id) : NO;
  }
  const amount = Number(match[1]) * (match[2] ? 1000 : 1);
  return amount > 0 ? bandFor(amount, bands) : NO;
}

function parseFloors(text: string): Parsed<1 | 2 | 3> {
  const word = norm(text).replace(/\s/gu, '');
  const match = /^(?:g\+)?(\d+)$/u.exec(word);
  if (!match) return NO;
  const count = Number(match[1]);
  if (count < 1) return NO;
  return yes(Math.min(count, 3) as 1 | 2 | 3);
}

function parseCityText(text: string, settings: OnboardingSettings): Parsed<string> {
  const value = clean(text);
  const key = value.toLowerCase().replace(/\s/gu, '');
  const listed = settings.serviceCities.find(
    (city) => city.toLowerCase().replace(/\s/gu, '') === key,
  );
  if (listed) return yes(listed);
  return value.length >= 2 && value.length <= 40 ? yes(value) : NO;
}

function parseChoice(step: OnboardStep, id: string, settings: OnboardingSettings): Parsed<unknown> {
  const prefix = `ob:${step}:`;
  if (!id.startsWith(prefix)) return NO;
  const value = id.slice(prefix.length);
  switch (step) {
    case 'language':
    case 'site':
    case 'roof':
    case 'photo':
      return (OPTIONS[step] as readonly string[]).includes(value) ? yes(value) : NO;
    case 'bill':
      return settings.billBands.some((band) => band.id === value) ? yes(value) : NO;
    case 'floors':
      return ['1', '2', '3'].includes(value) ? yes(Number(value)) : NO;
    case 'city':
      return settings.serviceCities.includes(value) ? yes(value) : NO;
    default:
      return NO;
  }
}

/**
 * Reads one customer answer for a step: a tapped choice ("ob:<step>:<value>") or typed
 * text (option number, a word in English/Marathi/Hindi, an amount). {ok:false} means
 * "ask again more simply". The "Other" city row ({@link CITY_OTHER_CHOICE}) is not an
 * answer; the bot waits for the city as text.
 */
export function parseAnswer(
  step: OnboardStep,
  input: { choiceId: string | null; text: string },
  settings: OnboardingSettings,
): Parsed<unknown> {
  if (input.choiceId) return parseChoice(step, input.choiceId, settings);
  const text = input.text;
  switch (step) {
    case 'language':
    case 'site':
    case 'roof':
      return matchOption(OPTIONS[step], text);
    case 'photo':
      // Only "later" is typed; "sent" happens when a photo really arrives.
      return matchOption(OPTIONS.photo, text, ['sent']);
    case 'bill':
      return parseBillText(text, settings.billBands);
    case 'floors':
      return parseFloors(text);
    case 'city':
      return parseCityText(text, settings);
    case 'name': {
      const name = clean(text);
      return name.length >= 2 && name.length <= 60 ? yes(name) : NO;
    }
    default:
      return NO;
  }
}

/**
 * The next question after `after`: steps whose value is already in `answers` or `known`
 * (from the lead) are skipped. Ends at 'done'.
 */
export function nextStep(
  after: OnboardStep,
  answers: OnboardAnswers,
  known: Partial<OnboardAnswers>,
): OnboardStep {
  for (const step of STEP_ORDER.slice(STEP_ORDER.indexOf(after) + 1)) {
    if (step === 'done') return 'done';
    if (answers[step] === undefined && known[step] === undefined) return step;
  }
  return 'done';
}

/** The question before this one, for "back"; the first step stays put. */
export function previousStep(step: OnboardStep): OnboardStep {
  return STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(step) - 1)] ?? 'language';
}
