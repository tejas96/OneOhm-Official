import type { customerActions } from '@oneohm/database';
import { isStepKind } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';

type Ask = Pick<typeof customerActions.$inferSelect, 'id' | 'type' | 'payload' | 'createdAt'>;

/** The roof question answered "Not yet" waits for the roof, not for an answer. */
export const isRoofWait = (ask: Pick<Ask, 'payload'>) => ask.payload.answer === 'not_yet';

/**
 * When the wait began: for a roof answered "Not yet" the day it was answered (the reminder and the
 * asker's alert count from there), otherwise the day it was asked.
 */
export function askedSince(ask: Ask): Date {
  const answered = isRoofWait(ask) ? Date.parse(String(ask.payload.answeredAt ?? '')) : Number.NaN;
  return Number.isNaN(answered) ? ask.createdAt : new Date(answered);
}

/** The subsidy question answered "Not yet" waits for the money; the owner hears after the days set in Settings. */
export const isSubsidyWait = (ask: Pick<Ask, 'payload'>) =>
  ask.payload.kind === 'subsidy_credit' && ask.payload.answer === 'not_yet';

const CONFIRM_WAITS: Readonly<Record<string, string>> = {
  installation: 'an answer about the installation',
  subsidy_register: 'the PM Surya Ghar registration',
  subsidy_credit: 'an answer about the subsidy',
  bank_sign: 'an answer about the visit to the bank',
  layout: 'an answer about the panel layout',
};

/** What the person who asked is told the customer has not done, per kind of ask. */
export function waitingFor(ask: Ask): string {
  if (ask.type === 'confirm')
    return (
      CONFIRM_WAITS[String(ask.payload.kind)] ??
      (isRoofWait(ask) ? 'the roof to be ready' : 'an answer about the roof')
    );
  if (ask.type === 'signature') return 'a paper to agree to';
  return (
    {
      location: 'the location of their home',
      pay: 'a payment (or its proof)',
      callback: 'a time for a call back',
      visit_pick: 'a day for our visit',
    } as Record<string, string>
  )[ask.type] as string;
}

/** The staff alert line: "answered Not yet on 3 Nov" says what really happened, "not answered" would not. */
export function waitingBody(ask: Ask): string {
  if (isRoofWait(ask))
    return `They answered Not yet on ${askedSince(ask).toISOString().slice(0, 10)} and the roof is still not ready. Please call them.`;
  return 'The customer was asked more than 4 days ago and has not answered. Please call them.';
}

/** The template and values of the customer reminder for a roof or installation question. */
export function confirmReminder(ask: Ask, given: { customer: string; home: string }) {
  if (isStepKind(ask.payload.kind)) return stepReminder(ask, given);
  if (ask.payload.kind === 'installation')
    return {
      template: 'installation_check',
      payload: {
        ...given,
        yesPayload: `ins:y:${ask.id}`,
        wrongPayload: `ins:bad:${ask.id}`,
      },
    };
  if (isRoofWait(ask))
    return {
      template: 'site_ready_reminder',
      payload: { ...given, readyNowPayload: `rdy:now:${ask.id}` },
    };
  return {
    template: 'site_ready_check',
    payload: { ...given, yesPayload: `rdy:y:${ask.id}`, notYetPayload: `rdy:n:${ask.id}` },
  };
}

/**
 * The reminder for a paper not yet agreed to (its button shows the paper again), or, once the customer
 * agreed but the signed page is missing (cancelled, never sent), for the signed page again.
 */
export function signatureReminder(ask: Ask, given: { customer: string; home: string }) {
  return {
    template: ask.payload.agreedAt ? 'signed_page_reminder' : 'signature_reminder',
    payload: {
      ...given,
      document: String(ask.payload.paperTitle ?? 'paper'),
      showPayload: `jr:${ask.id}`,
    },
  };
}

/** The reminder for a subsidy, bank or layout question: the same buttons again, by its approved template. */
export function stepReminder(ask: Ask, given: { customer: string; home: string }) {
  const id = ask.id;
  const ok = `stp:ok:${id}`;
  const alt = `stp:alt:${id}`;
  const text = (key: string) => String(ask.payload[key] ?? '');
  switch (ask.payload.kind) {
    case 'subsidy_register':
      return {
        template: 'subsidy_register_help',
        payload: { ...given, donePayload: ok, helpPayload: alt },
      };
    case 'subsidy_credit':
      return {
        template: 'subsidy_credit_check',
        payload: {
          ...given,
          amount: formatInr(Number(ask.payload.amountPaise ?? 0)),
          yesPayload: ok,
          notYetPayload: alt,
        },
      };
    case 'bank_sign':
      return {
        template: 'bank_sign_visit',
        payload: {
          customer: given.customer,
          bank: text('bank'),
          branch: text('branch'),
          day: text('dayText'),
          goPayload: ok,
          changePayload: alt,
        },
      };
    default:
      // The layout again: the paper-to-agree-to reminder whose button shows the layout with its two buttons.
      return {
        template: 'signature_reminder',
        payload: { ...given, document: text('paperTitle'), showPayload: `jr:${id}` },
      };
  }
}
