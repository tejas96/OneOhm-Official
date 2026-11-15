import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { type Notice, notify } from './notify';
import { daySpan, readableDay } from './readable-day';
import { travelClaims } from './schema/site-activity.schema';

/**
 * Tells the worker their travel money has been paid: "₹420 travel for 9 Nov 2026 paid".
 * Called when a bill becomes paid, by hand or by bank transfer; only a bill that came from
 * a travel claim says anything. It opens the worker's Travel screen. One alert per claim.
 */
export async function tellTravelPaid(db: DatabaseExecutor, payableId: string): Promise<boolean> {
  const [claim] = await db
    .select({
      id: travelClaims.id,
      userId: travelClaims.userId,
      workDate: travelClaims.workDate,
      amountPaise: travelClaims.amountPaise,
      projectId: travelClaims.projectId,
    })
    .from(travelClaims)
    .where(eq(travelClaims.payableId, payableId))
    .limit(1);
  if (!claim) return false;
  await notify(
    db,
    { userId: claim.userId },
    {
      kind: 'travel_claim_paid',
      title: `${formatInr(claim.amountPaise)} travel for ${readableDay(claim.workDate)} paid`,
      body: 'It has been paid out. Check your account.',
      subject: { type: 'travel_claim', id: claim.id },
      dedupeKey: `travel_claim_paid:${claim.id}`,
    },
  );
  return true;
}

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
  /** To the worker when the system made their claim and it looks clean: approved in the morning. */
  autoReady: (id: string, date: string, amount: number): Notice => ({
    kind: 'travel_claim_ready',
    title: `Travel ${formatInr(amount)} for ${readableDay(date)} is ready`,
    body: 'It will be approved tomorrow morning if everything checks out.',
    subject: { type: 'travel_claim', id },
    dedupeKey: `travel_claim_ready:${id}`,
  }),
  /** To the worker when the system made their claim and it waits for approval. */
  autoSent: (id: string, date: string, amount: number): Notice => ({
    kind: 'travel_claim_sent',
    title: `Travel ${formatInr(amount)} for ${readableDay(date)} sent for approval`,
    body: 'It was made for you from your route. You can cancel it if it is wrong.',
    subject: { type: 'travel_claim', id },
    dedupeKey: `travel_claim_sent:${id}`,
  }),
};
