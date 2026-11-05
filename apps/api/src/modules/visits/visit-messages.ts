import {
  callDay,
  type VisitKind,
  type VisitSlot,
  visitDayLabel,
  visitReminderWhen,
} from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import type { Built } from '../send-to-customer/send-messages';
import { DESCRIPTION_MAX, fitTitle, ROW_MAX } from '../whatsapp/assistant/chat-words';
import { languageNow } from '../whatsapp/assistant/language';
import { VISIT_WORDS, workWords } from './visit-words';

/** "Thu 6 Nov" in the language being spoken. */
export const dayWords = (day: string): string => visitDayLabel(day, languageNow());

/** "Thu 6 Nov, morning". */
export const whenWords = (day: string, slot: VisitSlot) =>
  `${dayWords(day)}, ${VISIT_WORDS.slots[slot]}`;

/** "tomorrow morning" the day before, else "on Mon 9 Nov, morning". */
export const reminderWhen = (day: string, today: string, slot: VisitSlot): string =>
  visitReminderWhen(day, today, slot, languageNow());

/** The tap ids (kept short; WhatsApp allows 256 characters). */
export const visitTaps = {
  ask: (visitActionId: string) => `vask:${visitActionId}`,
  day: (actionId: string, day: string) => `vday:${actionId}:${day}`,
  slot: (actionId: string, day: string, slot: VisitSlot) => `vslot:${actionId}:${day}:${slot}`,
  confirm: (visitId: string) => `vcf:${visitId}`,
  okay: (visitId: string) => `vok:${visitId}`,
  change: (visitId: string) => `vchg:${visitId}`,
};

const first = (name: string) => titleCaseName(name);

/** The list of free days (and "Talk to …") for a visit the team asked the customer to pick. */
export function pickList(given: {
  actionId: string;
  kind: VisitKind;
  home: string;
  days: readonly string[];
  name: string;
  again?: boolean;
  customer: string;
}): Built {
  const { pick } = VISIT_WORDS;
  const work = workWords(given.kind);
  const body =
    given.kind === 'amc' && !given.again
      ? pick.amc(given.home)
      : given.again
        ? pick.again(given.home, work)
        : pick.ask(given.home, work);
  const talk = {
    id: 'go:talk',
    title: fitTitle(pick.talk(given.name), ROW_MAX),
    description: fitTitle(pick.talkLine, DESCRIPTION_MAX),
  };
  const rows = given.days.slice(0, 9).map((day) => ({
    id: visitTaps.day(given.actionId, day),
    title: fitTitle(dayWords(day), ROW_MAX),
    description: pick.rowLine,
  }));
  return {
    replies: [
      {
        kind: 'list',
        body,
        button: pick.list,
        section: pick.section,
        rows: [...rows, talk],
      },
    ],
    template: {
      key: 'visit_pick',
      payload: {
        customer: first(given.customer),
        home: given.home,
        work,
        pickPayload: visitTaps.ask(given.actionId),
      },
    },
  };
}

/** [Morning] [Afternoon] for the day picked (only the slots still free). */
export function slotButtons(actionId: string, day: string, slots: readonly VisitSlot[]): Built {
  return {
    replies: [
      {
        kind: 'buttons',
        body: VISIT_WORDS.pick.slot(dayWords(day)),
        buttons: slots.map((slot) => ({
          id: visitTaps.slot(actionId, day, slot),
          title: VISIT_WORDS.buttons[slot],
        })),
      },
    ],
    template: { key: 'visit_pick', payload: {} },
  };
}

/** "Thanks — we'll confirm by 6:30 pm today." */
export function proposedThanks(now: Date, timeZone: string): string {
  return VISIT_WORDS.pick.thanks(VISIT_WORDS.pick.by[callDay(now, timeZone).day]);
}

/** "Booked ✅ Thu 6 Nov, morning. Ravi will call before coming." with [Okay] [Change day]. */
export function bookedMessage(given: {
  customer: string;
  visitId: string;
  day: string;
  slot: VisitSlot;
  staff: string;
  phone: string;
  moved: boolean;
}): Built {
  const when = whenWords(given.day, given.slot);
  const say = given.moved ? VISIT_WORDS.changed : VISIT_WORDS.booked;
  return {
    replies: [
      {
        kind: 'buttons',
        body: say(when, given.staff, given.phone),
        buttons: [
          { id: visitTaps.okay(given.visitId), title: VISIT_WORDS.buttons.okay },
          { id: visitTaps.change(given.visitId), title: VISIT_WORDS.buttons.change },
        ],
      },
    ],
    template: {
      key: 'visit_booked',
      payload: {
        customer: first(given.customer),
        when,
        staff: given.staff,
        okayPayload: visitTaps.okay(given.visitId),
        changePayload: visitTaps.change(given.visitId),
      },
    },
  };
}

/** "Our team visits Sangli tomorrow morning for the installation." [Confirm] [Change day]. */
export function reminderMessage(given: {
  customer: string;
  visitId: string;
  home: string;
  kind: VisitKind;
  day: string;
  slot: VisitSlot;
  today: string;
}): Built {
  const work = workWords(given.kind);
  const when = reminderWhen(given.day, given.today, given.slot);
  return {
    replies: [
      {
        kind: 'buttons',
        body: VISIT_WORDS.reminder(given.home, when, work),
        buttons: [
          { id: visitTaps.confirm(given.visitId), title: VISIT_WORDS.buttons.confirm },
          { id: visitTaps.change(given.visitId), title: VISIT_WORDS.buttons.change },
        ],
      },
    ],
    template: {
      key: 'visit_reminder',
      payload: {
        customer: first(given.customer),
        home: given.home,
        when,
        work,
        confirmPayload: visitTaps.confirm(given.visitId),
        changePayload: visitTaps.change(given.visitId),
      },
    },
  };
}

/** The DISCOM date the customer is told: [I'll be there] [Change day]. */
export function presenceMessage(given: {
  customer: string;
  visitId: string;
  home: string;
  kind: VisitKind;
  day: string;
}): Built {
  const work = workWords(given.kind);
  const day = dayWords(given.day);
  return {
    replies: [
      {
        kind: 'buttons',
        body: VISIT_WORDS.presence(work, given.home, day),
        buttons: [
          { id: visitTaps.confirm(given.visitId), title: VISIT_WORDS.buttons.there },
          { id: visitTaps.change(given.visitId), title: VISIT_WORDS.buttons.change },
        ],
      },
    ],
    template: {
      key: 'inspection_presence',
      payload: {
        customer: first(given.customer),
        work,
        home: given.home,
        day,
        confirmPayload: visitTaps.confirm(given.visitId),
        changePayload: visitTaps.change(given.visitId),
      },
    },
  };
}
