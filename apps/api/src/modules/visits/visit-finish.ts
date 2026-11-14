import { type DatabaseExecutor, visits } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { currentCalendar } from '../../common/calendar';
import { updateLeadFromChat } from '../crm/lead-from-chat';
import { logVisit, settleVisitActions, type VisitRow } from './visit-effects';
import { visitWhen as say } from './visit-when';

/** The visit happened. */
export async function finishVisit(
  tx: DatabaseExecutor,
  row: VisitRow,
  userId: string | null,
  title: string,
): Promise<VisitRow> {
  const now = new Date();
  const [updated] = await tx
    .update(visits)
    .set({ status: 'done', doneAt: now, updatedAt: now })
    .where(eq(visits.id, row.id))
    .returning();
  await settleVisitActions(tx, row, 'closed', ['presence', 'visit_pick']);
  // A lead's site visit is done: the next step is the quotation, today.
  if (row.leadId && row.kind === 'survey' && !row.taskId && !row.serviceRequestId)
    await updateLeadFromChat(
      tx,
      row.leadId,
      {
        nextAction: {
          on: todayIn(currentCalendar().timeZone, now),
          note: 'Send the quotation — site visit done',
        },
      },
      'Site visit done.',
    );
  await logVisit(
    tx,
    row,
    userId,
    'visit.done',
    `${title}: visit on ${say(row.day, row.slot, row.startMin, row.endMin)} done`,
  );
  return updated ?? row;
}

/** The customer said [Confirm] / [I'll be there]. */
export async function customerConfirmed(
  tx: DatabaseExecutor,
  row: VisitRow,
  title: string,
): Promise<void> {
  await tx
    .update(visits)
    .set({ customerConfirmedAt: new Date(), customerCannotAt: null, updatedAt: new Date() })
    .where(eq(visits.id, row.id));
  await settleVisitActions(tx, row, 'closed', ['presence']);
  await logVisit(
    tx,
    row,
    null,
    'visit.customer_confirmed',
    `${title}: the customer confirmed ${say(row.day, row.slot, row.startMin, row.endMin)}`,
  );
}
