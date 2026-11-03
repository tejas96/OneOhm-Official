import {
  type BillBand,
  CITY_OTHER_CHOICE,
  type OnboardingSettings,
  type OnboardStep,
  type RoofChoice,
  type SiteChoice,
} from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import { languageNow } from '../assistant/language';
import type { ChatReply } from '../chat-store';
import { ONBOARD_WORDS } from './onboard-words';
import { ESTIMATE_CHOICES, LATER_PERIODS, PERSON_CHOICE } from './onboarding-context';

/** What a question needs to know besides its step. */
export interface QuestionView {
  readonly settings: OnboardingSettings;
  /** The WhatsApp profile name, offered at the name question. */
  readonly profileName: string | null;
  /** The bot waits for a typed name or city (after "Change" or "Other city"). */
  readonly awaiting?: 'name' | 'city' | undefined;
  /** The last answer was unclear: say so, then ask again. */
  readonly retry?: boolean;
}

const SITES: readonly SiteChoice[] = ['home', 'society', 'business', 'farm'];
const ROOFS: readonly RoofChoice[] = ['rcc', 'tin', 'other'];
const FLOORS = [1, 2, 3] as const;
/** WhatsApp lists hold 10 rows. */
const MAX_ROWS = 10;

/** A bill band in the chat's language: the owner's translation, else the label (C13). */
function bandLabel(band: BillBand): string {
  const language = languageNow();
  return (language === 'mr' ? band.labelMr : language === 'hi' ? band.labelHi : null) ?? band.label;
}

/**
 * One onboarding question as a WhatsApp reply, in the language of the message being
 * handled. Every question but the language one offers "Talk to a person" (last row or
 * last button); free-text questions keep it as their only button. Lists, the photo and
 * typed questions after the name also offer "Back" (C14), unless a list is full.
 */
export function question(step: OnboardStep, view: QuestionView): ChatReply {
  const W = ONBOARD_WORDS;
  const person = { id: PERSON_CHOICE, title: W.talkToPerson };
  const back = { id: `ob:${step}:back`, title: W.back };
  const body = (text: string, typed = false) =>
    view.retry ? `${typed ? W.notClearTyped : W.notClear}\n${text}` : text;
  const list = (text: string, rows: readonly { id: string; title: string }[]): ChatReply => ({
    kind: 'list',
    body: body(text),
    button: W.choose,
    // A list saved before the row limits were cut keeps its rows; typed "back" still works.
    rows: rows.length + 2 <= MAX_ROWS ? [...rows, back, person] : [...rows, person],
  });
  const typed = (text: string): ChatReply => ({
    kind: 'buttons',
    body: body(text, true),
    buttons: step === 'name' ? [person] : [back, person],
  });
  switch (step) {
    case 'language':
      return {
        kind: 'buttons',
        body: body(W.askLanguage),
        buttons: (['en', 'mr', 'hi'] as const).map((language) => ({
          id: `ob:language:${language}`,
          title: W.languages[language],
        })),
      };
    case 'name': {
      const name = view.profileName?.trim() && titleCaseName(view.profileName);
      if (!name || view.awaiting === 'name') return typed(W.typeName);
      return {
        kind: 'buttons',
        body: body(W.askName(name)),
        buttons: [
          { id: 'ob:name:yes', title: W.yes },
          { id: 'ob:name:change', title: W.change },
          person,
        ],
      };
    }
    case 'city': {
      const cities = view.settings.serviceCities;
      if (cities.length === 0 || view.awaiting === 'city') return typed(W.typeCity);
      return list(W.askCity, [
        ...cities.map((city) => ({ id: `ob:city:${city}`, title: city })),
        { id: CITY_OTHER_CHOICE, title: W.otherCity },
      ]);
    }
    case 'site':
      return list(
        W.askSite,
        SITES.map((site) => ({ id: `ob:site:${site}`, title: W.sites[site] })),
      );
    case 'bill':
      return list(
        W.askBill,
        view.settings.billBands.map((band) => ({
          id: `ob:bill:${band.id}`,
          title: bandLabel(band),
        })),
      );
    case 'roof':
      return list(
        W.askRoof,
        ROOFS.map((roof) => ({ id: `ob:roof:${roof}`, title: W.roofs[roof] })),
      );
    case 'floors':
      return list(
        W.askFloors,
        FLOORS.map((floors) => ({ id: `ob:floors:${floors}`, title: W.floors[floors] })),
      );
    case 'photo':
      return {
        kind: 'buttons',
        body: body(W.askPhoto),
        buttons: [{ id: 'ob:photo:later', title: W.sendLater }, back, person],
      };
    // After the estimate PDF: what next, with a person in the middle.
    case 'done':
      return {
        kind: 'buttons',
        body: W.estimateNext,
        buttons: [
          { id: ESTIMATE_CHOICES.call, title: W.callMeBack },
          person,
          { id: ESTIMATE_CHOICES.notNow, title: W.notNow },
        ],
      };
  }
}

/** After "Not now": when to check back, as a list that still offers a person. */
export function laterQuestion(): ChatReply {
  const W = ONBOARD_WORDS;
  return {
    kind: 'list',
    body: W.askWhenLater,
    button: W.choose,
    rows: [
      ...LATER_PERIODS.map((period) => ({
        id: `${ESTIMATE_CHOICES.later}${period}`,
        title: W.later[period],
      })),
      { id: PERSON_CHOICE, title: W.talkToPerson },
    ],
  };
}
