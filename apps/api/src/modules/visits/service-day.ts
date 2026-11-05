import type { DatabaseExecutor } from '@oneohm/database';
import { freeSlots, type VisitSlot } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { tellBooked } from './visit-booked';
import { takenSlots } from './visit-capacity';
import { openVisitFor, targetOf } from './visit-reads';
import { cancelVisit, saveVisit } from './visit-store';

/**
 * The service desk's visit day goes through the visit record (redesign §8): the day books the
 * first free slot of the person who comes (the desk picks days, not times), the customer is
 * told with [Okay] [Change day], and clearing the day cancels the visit quietly.
 */
export async function setServiceDay(
  tx: DatabaseExecutor,
  userId: string,
  serviceRequestId: string,
  visitOn: string | null,
  timeZone: string,
): Promise<void> {
  const target = await targetOf(tx, { serviceRequestId });
  const existing = await openVisitFor(tx, target);
  if (!visitOn) {
    if (existing) await cancelVisit(tx, existing, userId, 'The day was cleared', target.title);
    return;
  }
  if (existing && existing.day === visitOn && existing.status === 'confirmed') return;
  const taken = await takenSlots(tx, target.crew, todayIn(timeZone), existing?.id);
  const slot: VisitSlot =
    existing?.day === visitOn ? existing.slot : (freeSlots(taken[visitOn] ?? [])[0] ?? 'morning');
  const { row, moved } = await saveVisit(
    tx,
    target,
    { day: visitOn, slot, status: 'confirmed', by: 'staff', userId },
    existing,
    new Date(),
    timeZone,
  );
  await tellBooked(tx, target, row, moved, userId);
}
