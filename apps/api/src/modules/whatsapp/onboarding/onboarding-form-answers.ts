import type { OnboardAnswers, OnboardingSettings } from '@oneohm/domain';
import { OTHER_CITY_OPTION } from '../forms/onboarding.flow';
import { readAnswer } from './onboarding-answer';

/** The questions the form answers, in the order the chat asks them. */
export const FORM_STEPS = ['name', 'city', 'site', 'bill', 'roof', 'floors'] as const;
export type FormStep = (typeof FORM_STEPS)[number];

export interface FormValues {
  /** Each answer the form gave that the chat would also accept; a missing or unreadable one is left out. */
  readonly values: Partial<Pick<OnboardAnswers, FormStep>>;
  /** "Other city" was picked without a usable typed city: the chat then asks for it typed. */
  readonly otherCity: boolean;
}

/**
 * Reads the form's answers through the same reader as the chat (`readAnswer`), so the rules are the chat's:
 * the options must be ones we offer, a typed name must be usable, a typed city 2 to 40 characters. Nothing
 * here guesses; whatever is not clear is simply asked in the chat afterwards.
 */
export function answersFromForm(
  raw: Readonly<Record<string, string>>,
  settings: OnboardingSettings,
): FormValues {
  const view = { settings, profileName: null };
  const read = (
    step: FormStep,
    input: { choiceId: string | null; text: string },
    awaiting?: 'name' | 'city',
  ) => {
    const got = readAnswer(step, input, { ...view, awaiting });
    return got.kind === 'value' ? got.value : undefined;
  };
  const picked = (step: Exclude<FormStep, 'name' | 'city'>) =>
    raw[step] ? read(step, { choiceId: `ob:${step}:${raw[step]}`, text: '' }) : undefined;

  const typedCity = raw.city === undefined || raw.city === OTHER_CITY_OPTION;
  const city = typedCity
    ? read('city', { choiceId: null, text: (raw.other_city ?? '').trim() }, 'city')
    : read('city', { choiceId: `ob:city:${raw.city}`, text: '' });
  const found: Record<FormStep, unknown> = {
    name: raw.name ? read('name', { choiceId: null, text: raw.name.trim() }, 'name') : undefined,
    city,
    site: picked('site'),
    bill: picked('bill'),
    roof: picked('roof'),
    floors: picked('floors'),
  };
  const values = Object.fromEntries(
    FORM_STEPS.flatMap((step) => (found[step] === undefined ? [] : [[step, found[step]]])),
  ) as FormValues['values'];
  return { values, otherCity: typedCity && city === undefined };
}
