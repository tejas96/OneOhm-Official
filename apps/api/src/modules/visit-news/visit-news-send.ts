import { Logger } from '@nestjs/common';
import { type DatabaseExecutor, projectTasks, serviceRequests, siteVisits } from '@oneohm/database';
import type { LeaveReason } from '@oneohm/domain';
import { and, eq, isNotNull, isNull, lte, type SQL } from 'drizzle-orm';
import { deliverRouted } from '../send-to-customer/send-deliver';
import type { Built } from '../send-to-customer/send-messages';
import { inLanguage } from '../whatsapp/assistant/language';
import { arrivedMessage, checkMessage } from './visit-news-messages';
import { type NewsTarget, newsContext, newsTargetFor, workerFirstName } from './visit-news-target';

/**
 * The site visit news the customer hears at check-in and check-out (Duty Day step 6): "Ravi has
 * reached Sangli", and "Was this visit done?". Each goes once per job and day (the outbox key).
 * A fault here is logged and never undoes the check-in or check-out (`safely`).
 */
const log = new Logger('VisitNews');

/** A job left unfinished waits this long for "customer not home" before the visit check goes. */
export const VISIT_CHECK_HOLD_MINUTES = 10;

type VisitRow = typeof siteVisits.$inferSelect;

/** Runs `run` in a savepoint: a failure is logged and leaves the caller's transaction whole. */
export async function safely(
  db: DatabaseExecutor,
  what: string,
  run: (tx: DatabaseExecutor) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction((tx) => run(tx));
  } catch (error) {
    log.error(`${what} failed`, error);
  }
}

const jobOf = (row: VisitRow) => ({ taskId: row.taskId, serviceRequestId: row.serviceRequestId });
const dayKey = (row: VisitRow) => `${row.taskId ?? row.serviceRequestId}:${row.workDate}`;

/** Tells the customer in their language: the chat message while open, else the template. */
export async function tellNews(
  db: DatabaseExecutor,
  target: NewsTarget,
  build: () => Built,
  key: string,
) {
  const ctx = await newsContext(db, target);
  const built = await inLanguage(ctx.language, async () => build());
  await deliverRouted(db, ctx, built, key, null);
}

async function visitRow(db: DatabaseExecutor, siteVisitId: string): Promise<VisitRow | null> {
  const [row] = await db.select().from(siteVisits).where(eq(siteVisits.id, siteVisitId)).limit(1);
  return row && (row.taskId || row.serviceRequestId) ? row : null;
}

/** "Arrived" is news only this soon after the check-in: a late upload never says it afterwards. */
export const ARRIVED_FRESH_MINUTES = 10;

/**
 * Whether "has reached" is still true and fresh: the visit is open and its check-in recent. A
 * phone that uploads its route late (a backlog of points) can make the check-in after the
 * worker already left; the customer is then not told someone "has reached" them.
 */
export function arrivedIsNews(
  row: Pick<VisitRow, 'checkInAt' | 'checkOutAt'>,
  now: Date = new Date(),
): boolean {
  if (row.checkOutAt) return false;
  return now.getTime() - row.checkInAt.getTime() <= ARRIVED_FRESH_MINUTES * 60_000;
}

/** "Ravi from OneOhm has reached Sangli", at a check-in by hand or by the fence. */
export async function tellArrived(db: DatabaseExecutor, siteVisitId: string): Promise<void> {
  const row = await visitRow(db, siteVisitId);
  if (!row || !arrivedIsNews(row)) return;
  const target = await newsTargetFor(db, jobOf(row));
  if (!target) return;
  const worker = await workerFirstName(db, row.userId);
  const given = { customer: target.customerName, worker, home: target.home };
  await tellNews(db, target, () => arrivedMessage(given), `worker_arrived:${dayKey(row)}`);
}

/** The visit check itself; the hold is cleared so it never goes twice. */
async function sendCheck(db: DatabaseExecutor, row: VisitRow): Promise<void> {
  await db.update(siteVisits).set({ customerCheckDueAt: null }).where(eq(siteVisits.id, row.id));
  const target = await newsTargetFor(db, jobOf(row));
  if (!target || row.customerSaid) return;
  const worker = await workerFirstName(db, row.userId);
  const given = { customer: target.customerName, worker, home: target.home, siteVisitId: row.id };
  await tellNews(db, target, () => checkMessage(given), `visit_check:${dayKey(row)}`);
}

/** The work is finished: the task completed (or in review), the request resolved. */
async function jobFinished(db: DatabaseExecutor, row: VisitRow): Promise<boolean> {
  if (row.checkOutSource === 'task_complete') return true;
  if (row.taskId) {
    const [task] = await db
      .select({ status: projectTasks.status })
      .from(projectTasks)
      .where(eq(projectTasks.id, row.taskId));
    return task?.status === 'completed' || task?.status === 'in_review';
  }
  const [request] = await db
    .select({ status: serviceRequests.status })
    .from(serviceRequests)
    .where(eq(serviceRequests.id, row.serviceRequestId ?? ''));
  return request?.status === 'resolved';
}

/**
 * At a real check-out (the worker's own, the fence, the route, the task finishing; never a
 * manager's force-close or the day's end): "Was this visit done?". With the job finished it goes
 * now; a job left unfinished waits 10 minutes, since the worker may say the customer was not home.
 */
export async function askVisitCheck(
  db: DatabaseExecutor,
  siteVisitId: string,
  now: Date = new Date(),
): Promise<void> {
  const row = await visitRow(db, siteVisitId);
  if (!row?.checkOutAt || row.customerSaid) return;
  if (await jobFinished(db, row)) return sendCheck(db, row);
  await db
    .update(siteVisits)
    .set({ customerCheckDueAt: new Date(now.getTime() + VISIT_CHECK_HOLD_MINUTES * 60_000) })
    .where(eq(siteVisits.id, row.id));
}

/** The worker said why they left: "customer not home" drops the waiting check; any other reason sends it. */
export async function afterLeaveReason(
  db: DatabaseExecutor,
  siteVisitId: string,
  reason: LeaveReason,
): Promise<void> {
  const row = await visitRow(db, siteVisitId);
  if (!row?.customerCheckDueAt) return;
  if (reason !== 'customer_not_home') return sendCheck(db, row);
  await db.update(siteVisits).set({ customerCheckDueAt: null }).where(eq(siteVisits.id, row.id));
}

/**
 * The person's waiting visit checks whose wait is over go out (after each route upload); with
 * `all`, every waiting one (the person ended their day, so no reason will come any more).
 */
export async function sendDueChecks(
  db: DatabaseExecutor,
  userId: string,
  now: Date,
  all = false,
): Promise<void> {
  const due = [
    eq(siteVisits.userId, userId),
    isNotNull(siteVisits.customerCheckDueAt),
    isNull(siteVisits.customerSaid),
    ...(all ? [] : [lte(siteVisits.customerCheckDueAt, now)]),
  ];
  const rows = await db
    .select()
    .from(siteVisits)
    .where(and(...due) as SQL);
  for (const row of rows) await safely(db, `Visit check ${row.id}`, (tx) => sendCheck(tx, row));
}
