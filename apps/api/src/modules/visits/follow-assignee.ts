import { alertVisitOwner, type DatabaseExecutor, visits } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { busyOn, contactOf } from './visit-capacity';
import { logVisit } from './visit-effects';
import { dayWords } from './visit-messages';
import { openVisitFor, targetOf, type VisitScope } from './visit-reads';
import { tellCrewChanged, visitContext } from './visit-tell';

/**
 * The task, service request or lead of an open visit changed hands (call it after the change is
 * saved, from every path that reassigns): the visit's crew follows, the new person's day is
 * checked (leave, or the slot already held), the change is logged, and a confirmed visit tells
 * the customer who will call. A person who is busy that day is told to the visit's owner (the
 * manager or desk), who changes the visit or the assignee.
 */
export async function followAssignee(
  tx: DatabaseExecutor,
  scope: VisitScope,
  newUserId: string | null,
  actorId: string | null = null,
): Promise<void> {
  const target = await targetOf(tx, scope).catch(() => null);
  if (!target) return;
  const visit = await openVisitFor(tx, target);
  if (!visit) return;
  const crew = newUserId ? [newUserId] : [];
  if (visit.crewUserIds[0] === crew[0]) return;
  await tx
    .update(visits)
    .set({ crewUserIds: crew, updatedAt: new Date() })
    .where(eq(visits.id, visit.id));
  const who = await contactOf(tx, newUserId);
  await logVisit(
    tx,
    visit,
    actorId,
    'visit.crew_changed',
    `${target.title}: ${who?.name ?? 'nobody'} now comes for the visit on ${dayWords(visit.day)}`,
    { userId: newUserId },
  );
  const busy =
    newUserId && visit.kind !== 'inspection' && visit.kind !== 'net_meter'
      ? await busyOn(tx, newUserId, visit.day, visit.slot, visit.id)
      : null;
  if (busy)
    // Not the busy person: the manager, desk or lead owner decides.
    await alertVisitOwner(
      tx,
      { ...visit, crewUserIds: [] },
      {
        kind: 'visit_crew_busy',
        title: `${who?.name ?? 'The new person'} is busy on ${dayWords(visit.day)}`,
        body: `${target.title}: ${busy === 'leave' ? 'on leave' : 'already has a visit in that slot'}. Change the visit or the assignee.`,
        key: `visit_crew_busy:${visit.id}:${newUserId}`,
      },
    );
  if (visit.status === 'confirmed' && target.mayMessage && who)
    await tellCrewChanged(tx, await visitContext(tx, target), {
      day: visit.day,
      name: who.name,
      phone: who.phone,
      key: `visit_crew:${visit.id}:${newUserId}`,
    });
}

/** The same for several tasks, requests or leads reassigned at once. */
export async function followAssignees(
  tx: DatabaseExecutor,
  kind: 'taskId' | 'serviceRequestId' | 'leadId',
  ids: readonly string[],
  newUserId: string | null,
  actorId: string | null = null,
): Promise<void> {
  for (const id of ids) await followAssignee(tx, { [kind]: id }, newUserId, actorId);
}
