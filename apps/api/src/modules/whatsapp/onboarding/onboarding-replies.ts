import {
  CITY_OTHER_CHOICE,
  type OnboardingSettings,
  type OnboardStep,
  type RoofChoice,
  type SiteChoice,
} from '@oneohm/domain';
import type { ChatReply } from '../chat-store';
import { ONBOARD_WORDS } from './onboard-words';
import { PERSON_CHOICE } from './onboarding-context';

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

/**
 * One onboarding question as a WhatsApp reply, in the language of the message being
 * handled. Every question but the language one offers "Talk to a person" (last row or
 * last button); free-text questions keep it as their only button.
 */
export function question(step: OnboardStep, view: QuestionView): ChatReply {
  const W = ONBOARD_WORDS;
  const person = { id: PERSON_CHOICE, title: W.talkToPerson };
  const body = (text: string, typed = false) =>
    view.retry ? `${typed ? W.notClearTyped : W.notClear}\n${text}` : text;
  const list = (text: string, rows: readonly { id: string; title: string }[]): ChatReply => ({
    kind: 'list',
    body: body(text),
    button: W.choose,
    rows: [...rows, person],
  });
  const typed = (text: string): ChatReply => ({
    kind: 'buttons',
    body: body(text, true),
    buttons: [person],
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
      const name = view.profileName?.trim();
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
        view.settings.billBands.map((band) => ({ id: `ob:bill:${band.id}`, title: band.label })),
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
        buttons: [{ id: 'ob:photo:later', title: W.sendLater }, person],
      };
    case 'done':
      return { kind: 'text', body: W.preparing };
  }
}
