/**
 * The self site survey (redesign §7): what the customer answers and photographs, in the order the form
 * and the chat ask it. Ids are stored; words are written per language by the API.
 */
export const SURVEY_PHOTOS = ['corner_a', 'corner_b', 'meter', 'board'] as const;
export type SurveyPhoto = (typeof SURVEY_PHOTOS)[number];

export const ROOF_TYPES = ['rcc', 'tin', 'tile', 'other'] as const;
/** Floors of the building; `4` means four or more. */
export const FLOOR_COUNTS = ['1', '2', '3', '4'] as const;
export const SHADES = ['none', 'morning', 'evening', 'lot'] as const;
/** Roof size in square feet: under 300, 300-600, 600-1000, over 1000, not known. */
export const ROOF_SIZES = ['s1', 's2', 's3', 's4', 'unknown'] as const;

export const SURVEY_ANSWERS = ['roof', 'floors', 'shade', 'size', 'consumer'] as const;
export type SurveyAnswerKey = (typeof SURVEY_ANSWERS)[number];

/** One thing the customer gives, and so one thing the engineer can ask again. */
export const SURVEY_ITEMS = [
  'roof',
  'floors',
  'corner_a',
  'corner_b',
  'meter',
  'board',
  'shade',
  'size',
  'consumer',
] as const;
export type SurveyItem = (typeof SURVEY_ITEMS)[number];

export const isSurveyItem = (value: unknown): value is SurveyItem =>
  (SURVEY_ITEMS as readonly unknown[]).includes(value);

export interface SurveyAnswers {
  readonly roof?: string;
  readonly floors?: string;
  readonly shade?: string;
  readonly size?: string;
  readonly consumer?: string;
}

const OPTIONS: Readonly<Record<'roof' | 'floors' | 'shade' | 'size', readonly string[]>> = {
  roof: ROOF_TYPES,
  floors: FLOOR_COUNTS,
  shade: SHADES,
  size: ROOF_SIZES,
};

/** Whether a tapped or posted value is one of the offered options of a question. */
export const isOption = (question: 'roof' | 'floors' | 'shade' | 'size', value: unknown) =>
  typeof value === 'string' && OPTIONS[question].includes(value);

/**
 * What is still missing, in asking order. The consumer number is only asked when the home has none.
 * `photos` are the items already given.
 */
export function missingItems(
  answers: SurveyAnswers,
  given: readonly SurveyPhoto[],
  consumerKnown: boolean,
): SurveyItem[] {
  return SURVEY_ITEMS.filter((item) => {
    if (item === 'consumer') return !consumerKnown && !answers.consumer;
    if (item === 'roof' || item === 'floors' || item === 'shade' || item === 'size')
      return !answers[item];
    return !given.includes(item);
  });
}

const STRUCTURE_TEXT: Readonly<Record<string, string>> = {
  rcc: 'RCC roof',
  tin: 'Tin shed',
  tile: 'Tiled roof',
  other: 'Other roof',
};
const SHADE_TEXT: Readonly<Record<string, string>> = {
  none: 'No shade',
  morning: 'Some shade in the morning',
  evening: 'Some shade in the evening',
  lot: 'A lot of shade',
};
const SIZE_TEXT: Readonly<Record<string, string>> = {
  s1: 'Under 300 sq ft',
  s2: '300 to 600 sq ft',
  s3: '600 to 1000 sq ft',
  s4: 'Over 1000 sq ft',
  unknown: 'Customer does not know',
};

/** The survey report fields the answers fill (the field survey's own keys where there is one). */
export function surveyFacts(answers: SurveyAnswers): Record<string, string> {
  const facts: Record<string, string> = {};
  if (answers.floors) facts.site_floors = answers.floors === '4' ? '4' : answers.floors;
  if (answers.roof) facts.structure_type = STRUCTURE_TEXT[answers.roof] ?? answers.roof;
  if (answers.shade) facts.self_survey_shade = SHADE_TEXT[answers.shade] ?? answers.shade;
  if (answers.size) facts.self_survey_roof_size = SIZE_TEXT[answers.size] ?? answers.size;
  return facts;
}

/** The caption a survey photo gets on the home. */
export const PHOTO_CAPTION: Readonly<Record<SurveyPhoto, string>> = {
  corner_a: 'Self survey: roof corner A',
  corner_b: 'Self survey: roof corner B',
  meter: 'Self survey: electricity meter',
  board: 'Self survey: main switch board',
};

/** Days a started survey is offered on Home, and the day a reminder goes (redesign §7). */
export const SURVEY_HOME_DAYS = 7;
export const SURVEY_REMIND_DAYS = 2;

/**
 * What the offer is worth now: the configured credit, or none when the offer is off. A credit is
 * kept as offered, so a later change in Settings does not change a survey already sent.
 */
export function offerPaise(setting: { selfSurveyOffer: boolean; selfSurveyPaise: number }): number {
  return setting.selfSurveyOffer ? setting.selfSurveyPaise : 0;
}

/** The checks for the setting: the credit is a whole number of rupees from 1 to 1,00,000. */
export function checkSurveyCredit(paise: number): string | null {
  const ok = Number.isInteger(paise) && paise % 100 === 0 && paise >= 100 && paise <= 10_000_000;
  return ok ? null : 'Use a whole number of rupees from 1 to 1,00,000.';
}
