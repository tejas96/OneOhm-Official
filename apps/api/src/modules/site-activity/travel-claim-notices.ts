import type { Notice } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { daySpan } from '../../common/notices';

/** The words people read about a travel claim, one builder per event. */
export const TRAVEL_NOTICES = {
  made: (id: string, name: string, date: string, amount: number): Notice => ({
    kind: 'travel_claim',
    title: 'Travel claim',
    body: `${name}: ${daySpan(date, date)}, ${formatInr(amount)}.`,
    subject: { type: 'travel_claim', id },
    dedupeKey: `travel_claim:${id}`,
  }),
  decided: (id: string, approved: boolean, date: string, amount: number): Notice => ({
    kind: 'travel_claim_decided',
    title: approved ? 'Travel claim approved' : 'Travel claim not approved',
    body: `${daySpan(date, date)}, ${formatInr(amount)}${approved ? '. Finance pays it next.' : '.'}`,
    subject: { type: 'travel_claim', id },
    dedupeKey: `travel_claim_decided:${id}`,
  }),
  /** To finance, on approval: the bill is ready to pay. Opens that bill in Finance. */
  readyToPay: (
    payableId: string,
    projectId: string | null,
    name: string,
    date: string,
    amount: number,
  ): Notice => ({
    kind: 'travel_payable_ready',
    title: 'Travel claim approved, ready to pay',
    body: `${name}: ${daySpan(date, date)}, ${formatInr(amount)}.`,
    subject: { type: 'payable', id: payableId, projectId },
    dedupeKey: `travel_payable_ready:${payableId}`,
  }),
  /** To the worker when an approved claim is voided; the day can be claimed again. */
  voided: (id: string, date: string, amount: number, reason: string): Notice => ({
    kind: 'travel_claim_voided',
    title: 'Travel claim cancelled',
    body: `${daySpan(date, date)}, ${formatInr(amount)} was cancelled: ${reason}. You can claim the day again.`,
    subject: { type: 'travel_claim', id },
    dedupeKey: `travel_claim_voided:${id}`,
  }),
  /** To finance when the bill is cancelled, so nobody pays it. */
  billVoided: (
    payableId: string,
    projectId: string | null,
    name: string,
    date: string,
    amount: number,
  ): Notice => ({
    kind: 'travel_payable_voided',
    title: 'Travel bill cancelled, do not pay',
    body: `${name}: ${daySpan(date, date)}, ${formatInr(amount)}. The claim was voided.`,
    subject: { type: 'payable', id: payableId, projectId },
    dedupeKey: `travel_payable_voided:${payableId}`,
  }),
};
