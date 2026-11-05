import {
  customerActions,
  customers,
  type Database,
  notifyCover,
  notifyHolders,
} from '@oneohm/database';
import { workingMinutesBetween } from '@oneohm/domain';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

/** Late for this many working minutes (Mon-Sat 9:30-18:30), the call is the service desk's business too. */
const MANAGER_AFTER_MIN = 4 * 60;
const UNTIL = 7 * 24 * 3_600_000;
const PER_TICK = 200;

/**
 * The calls we promised customers (a problem, a low rating, a reopened problem, a quote question, an AMC
 * renewal; redesign §12, §13). Each is a "To call" ask with the time it is late (`callBy`). When that time
 * passes and nobody has marked it Called, the person who owns it is told; 4 working hours later the service desk is.
 * Each stage alerts once, so a tick that repeats says nothing more.
 */
export async function queueCallTasks(
  db: Database,
  now: Date,
  timeZone = 'Asia/Kolkata',
): Promise<number> {
  const callBy = sql<string>`${customerActions.payload}->>'callBy'`;
  const late = await db
    .select({ action: customerActions, customer: customers.name })
    .from(customerActions)
    .innerJoin(customers, eq(customers.id, customerActions.customerId))
    .where(
      and(
        eq(customerActions.type, 'callback'),
        eq(customerActions.status, 'received'),
        sql`${customerActions.payload}->>'kind' = 'call_task'`,
        sql`(${callBy})::timestamptz <= ${now.toISOString()}::timestamptz`,
        gt(customerActions.createdAt, new Date(now.getTime() - UNTIL)),
        sql`coalesce(${customerActions.payload}->>'escalated', '') <> 'manager'`,
      ),
    )
    .orderBy(asc(customerActions.createdAt))
    .limit(PER_TICK);
  let told = 0;
  for (const { action, customer } of late) {
    const due = new Date(String(action.payload.callBy));
    const managerDue = workingMinutesBetween(due, now, timeZone) >= MANAGER_AFTER_MIN;
    const stage = managerDue ? 'manager' : 'owner';
    if (action.payload.escalated === stage || (action.payload.escalated === 'owner' && !managerDue))
      continue;
    const owner = typeof action.payload.owner === 'string' ? action.payload.owner : null;
    const notice = {
      kind: 'call_late',
      title: `A promised call to ${customer} is late`,
      body:
        stage === 'owner'
          ? `${action.title}. Call them now and mark it Called, or the service desk is told in 4 working hours.`
          : `${action.title}. It is more than 4 working hours late: please call them now.`,
      ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
      dedupeKey: `call_late:${action.id}:${stage}`,
    };
    if (stage === 'owner' && owner) await notifyCover(db, owner, 'service.manage', notice);
    else await notifyHolders(db, 'service.manage', notice);
    await db
      .update(customerActions)
      .set({ payload: { ...action.payload, escalated: stage }, updatedAt: action.updatedAt })
      .where(eq(customerActions.id, action.id));
    told += 1;
  }
  return told;
}
