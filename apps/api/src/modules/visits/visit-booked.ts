import {
  customerActions,
  type DatabaseExecutor,
  messageTemplates,
  queueCustomerMessage,
} from '@oneohm/database';
import { factLabel, isPresenceKind, templateIsOn } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { daySpan } from '../../common/notices';
import { contactOf } from './visit-capacity';
import type { VisitRow } from './visit-effects';
import { bookedMessage, presenceMessage } from './visit-messages';
import type { VisitTarget } from './visit-reads';
import { tellVisit, visitContext } from './visit-tell';
import { VISIT_WORDS } from './visit-words';

async function templateOn(db: DatabaseExecutor, key: string): Promise<boolean> {
  const [row] = await db
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, key))
    .limit(1);
  return templateIsOn(key, row);
}

/**
 * Tells the customer the day the team set: "Booked ✅ …" with [Okay] [Change day] (or the DISCOM
 * date with [I'll be there] [Change day], and its presence ask). Outside the 24-hour window the
 * approved template goes; until it is switched on a service visit keeps its older message.
 */
export async function tellBooked(
  tx: DatabaseExecutor,
  target: VisitTarget,
  row: VisitRow,
  moved: boolean,
  userId: string | null,
): Promise<void> {
  const ctx = await visitContext(tx, target);
  const key = `visit:${row.id}:${row.day}:${row.slot}:${Date.now()}`;
  if (isPresenceKind(row.kind)) {
    await tx.insert(customerActions).values({
      type: 'presence',
      customerId: row.customerId,
      projectId: row.projectId,
      leadId: row.leadId,
      propertyId: row.propertyId,
      taskId: row.taskId,
      title: `${target.title} on ${row.day}`,
      payload: { visitId: row.id, visitKind: row.kind },
      requestedByUserId: userId,
    });
    await tellVisit(
      tx,
      ctx,
      () =>
        presenceMessage({
          customer: target.customerName,
          visitId: row.id,
          home: target.home,
          kind: row.kind,
          day: row.day,
        }),
      key,
      userId,
    );
    return;
  }
  if (!ctx.chatOpen && target.serviceRequestId && !(await templateOn(tx, 'visit_booked'))) {
    await queueCustomerMessage(
      tx,
      target.phone,
      'service_visit_booked',
      {
        customer: target.customerName,
        topic: factLabel(target.title),
        date: daySpan(row.day, row.day),
      },
      `service_visit_booked:${target.serviceRequestId}:${row.day}`,
    );
    return;
  }
  const who = await contactOf(tx, row.crewUserIds[0]);
  await tellVisit(
    tx,
    ctx,
    () =>
      bookedMessage({
        customer: target.customerName,
        visitId: row.id,
        day: row.day,
        slot: row.slot,
        staff: who?.name ?? VISIT_WORDS.pick.team,
        phone: who?.phone ?? '',
        moved,
      }),
    key,
    userId,
  );
}
