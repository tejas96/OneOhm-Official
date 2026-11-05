import type { customerActions } from '@oneohm/database';

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

/** What the person who asked is told the customer has not done, per kind of ask. */
export function waitingFor(ask: Ask): string {
  if (ask.type === 'confirm')
    return ask.payload.kind === 'installation'
      ? 'an answer about the installation'
      : isRoofWait(ask)
        ? 'the roof to be ready'
        : 'an answer about the roof';
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

/** The reminder for a paper not yet agreed to: its button shows the paper again. */
export function signatureReminder(ask: Ask, given: { customer: string; home: string }) {
  return {
    template: 'signature_reminder',
    payload: {
      ...given,
      document: String(ask.payload.paperTitle ?? 'paper'),
      showPayload: `jr:${ask.id}`,
    },
  };
}
