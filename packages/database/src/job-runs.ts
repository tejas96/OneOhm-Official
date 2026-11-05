import { JOB_RUN_KEEP_DAYS, type JobName, jobErrorText } from '@oneohm/domain';
import { and, desc, eq, gte, inArray, lt, or } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { jobRuns } from './schema/automation.schema';
import { waFlowTokens } from './schema/whatsapp.schema';

export interface JobRunOptions {
  readonly trigger?: 'schedule' | 'background' | 'retry';
  /** An existing queued row (a retry someone asked for) to fill in instead of a new one. */
  readonly runId?: string | null;
  /**
   * Frequent background loops: keep a run only when it did something or failed, so the
   * table shows work, not every empty tick.
   */
  readonly quiet?: boolean;
}

/** A job's summary: a few words, or null when there was nothing to do (quiet runs skip it). */
export type JobSummary = string | null;

/**
 * Runs one job and keeps its run (PRD 7.1 "workflow history and failure visibility"):
 * started, finished, what it did, or the error. The job's own error is re-thrown so
 * Temporal's retries still happen.
 */
export async function recordJobRun<T>(
  db: DatabaseExecutor,
  name: JobName,
  run: () => Promise<T>,
  summarise: (result: T) => JobSummary,
  options: JobRunOptions = {},
): Promise<T> {
  const startedAt = new Date();
  const trigger = options.trigger ?? 'schedule';
  let id = options.runId ?? null;
  if (id) {
    await db.update(jobRuns).set({ status: 'running', startedAt }).where(eq(jobRuns.id, id));
  } else if (!options.quiet) {
    const [row] = await db
      .insert(jobRuns)
      .values({ name, trigger, status: 'running', startedAt })
      .returning({ id: jobRuns.id });
    id = row?.id ?? null;
  }
  const finish = async (values: Partial<typeof jobRuns.$inferInsert>) => {
    const done = { ...values, finishedAt: new Date() };
    if (id) await db.update(jobRuns).set(done).where(eq(jobRuns.id, id));
    else
      await db
        .insert(jobRuns)
        .values({ name, trigger, startedAt, ...done, status: done.status ?? 'succeeded' });
  };
  try {
    const result = await run();
    const summary = summarise(result);
    if (!(options.quiet && !id && summary === null))
      await finish({ status: 'succeeded', result: summary });
    return result;
  } catch (error) {
    await finish({ status: 'failed', error: jobErrorText(error) });
    throw error;
  }
}

/** True when the job already finished well since `since` (a timed job runs once a day). */
export async function jobSucceededSince(
  db: DatabaseExecutor,
  name: JobName,
  since: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(
      and(eq(jobRuns.name, name), eq(jobRuns.status, 'succeeded'), gte(jobRuns.startedAt, since)),
    )
    .limit(1);
  return Boolean(row);
}

/** A retry nobody picked up within this long is given up on, so another can be asked for. */
export const STALE_RETRY_MS = 3_600_000;
export const STALE_RETRY_ERROR =
  'Never picked up: the background worker may be stopped. Ask your developer to check it.';

/** Gives up on queued retries older than an hour (the worker was not running). */
export async function expireStaleRetries(db: DatabaseExecutor, now = new Date()): Promise<void> {
  await db
    .update(jobRuns)
    .set({ status: 'failed', finishedAt: now, error: STALE_RETRY_ERROR })
    .where(
      and(
        eq(jobRuns.status, 'queued'),
        lt(jobRuns.createdAt, new Date(now.getTime() - STALE_RETRY_MS)),
      ),
    );
}

/**
 * Clears runs older than the keep period, runs stuck as running after a restart and
 * retries nobody picked up, and the tokens of forms that were answered or have expired.
 */
export async function clearOldJobRuns(db: DatabaseExecutor, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - JOB_RUN_KEEP_DAYS * 86_400_000);
  const old = await db
    .delete(jobRuns)
    .where(lt(jobRuns.createdAt, cutoff))
    .returning({ id: jobRuns.id });
  const stale = new Date(now.getTime() - 6 * 3_600_000);
  await db
    .update(jobRuns)
    .set({ status: 'failed', finishedAt: now, error: 'Stopped before it finished.' })
    .where(and(inArray(jobRuns.status, ['running']), lt(jobRuns.startedAt, stale)));
  await expireStaleRetries(db, now);
  const spent = new Date(now.getTime() - 86_400_000);
  await db
    .delete(waFlowTokens)
    .where(or(lt(waFlowTokens.expiresAt, spent), lt(waFlowTokens.usedAt, spent)));
  return old.length;
}

/** A message that could not be sent after every retry, kept so someone can resend it. */
export async function recordDeliveryFailure(
  db: DatabaseExecutor,
  outboxId: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  await db.insert(jobRuns).values({
    name: 'message_delivery',
    trigger: 'background',
    status: 'failed',
    startedAt: now,
    finishedAt: now,
    error: jobErrorText(reason),
    subjectId: outboxId,
  });
}

/**
 * For the API's own frequent loops (payment links, payouts, incentives): keeps a run
 * only when it did something or failed. Never throws, so a loop is never broken by it.
 */
export async function noteBackgroundRun(
  db: DatabaseExecutor,
  name: JobName,
  outcome: { readonly count?: number; readonly error?: unknown },
): Promise<void> {
  const failed = outcome.error !== undefined;
  const now = new Date();
  try {
    // A quiet tick after a failure is kept too, so the list shows the job worked again.
    if (!failed && !outcome.count && !(await lastRunFailed(db, name))) return;
    await db.insert(jobRuns).values({
      name,
      trigger: 'background',
      status: failed ? 'failed' : 'succeeded',
      startedAt: now,
      finishedAt: now,
      result: failed || !outcome.count ? null : String(outcome.count),
      error: failed ? jobErrorText(outcome.error) : null,
    });
  } catch {
    // The run record is a convenience; the loop's own work and logs carry on.
  }
}

async function lastRunFailed(db: DatabaseExecutor, name: JobName): Promise<boolean> {
  const [last] = await db
    .select({ status: jobRuns.status })
    .from(jobRuns)
    .where(eq(jobRuns.name, name))
    .orderBy(desc(jobRuns.createdAt))
    .limit(1);
  return last?.status === 'failed';
}
