import { type DatabaseExecutor, marketingJobs } from '@oneohm/database';
import { eq } from 'drizzle-orm';

export interface JobRow {
  readonly ranAt: Date;
  readonly lastError: string | null;
  readonly data: Record<string, unknown> | null;
}

/** A job that failed before it ever worked keeps this time, so it is due again next tick. */
const NEVER = new Date(0);

/** When a job last worked (null: never) and what it learnt. */
export async function readJob(db: DatabaseExecutor, key: string): Promise<JobRow | null> {
  const [row] = await db.select().from(marketingJobs).where(eq(marketingJobs.key, key));
  if (!row) return null;
  return { ranAt: row.ranAt, lastError: row.lastError, data: row.data as JobRow['data'] };
}

/** The last time the job worked, or null (a row made only by a failure or by data does not count). */
export const lastWorked = (row: JobRow | null): Date | null =>
  row && row.ranAt.getTime() > 0 ? row.ranAt : null;

/** Records a run: a success moves its time; a failure keeps the old time and stores the words. */
export async function markJobRun(
  db: DatabaseExecutor,
  key: string,
  error: string | null,
  now = new Date(),
): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(marketingJobs)
    .values({ key, ranAt: error ? NEVER : now, lastError: error, updatedAt })
    .onConflictDoUpdate({
      target: marketingJobs.key,
      set: error ? { lastError: error, updatedAt } : { ranAt: now, lastError: null, updatedAt },
    });
}

/**
 * Records that a platform's turn ran, with the words of a refusal waiting will not fix. The run
 * counts (its time moves), so the platform is tried again at the job's normal pace, not every tick.
 */
export async function markPlatformRun(
  db: DatabaseExecutor,
  key: string,
  error: string | null,
  now: Date,
): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(marketingJobs)
    .values({ key, ranAt: now, lastError: error, updatedAt })
    .onConflictDoUpdate({
      target: marketingJobs.key,
      set: { ranAt: now, lastError: error, updatedAt },
    });
}

/** Adds to what a job learnt, keeping the other keys (a place name saved elsewhere stays). */
export async function mergeJobData(
  db: DatabaseExecutor,
  key: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const data = { ...((await readJob(db, key))?.data ?? {}), ...patch };
  const updatedAt = new Date();
  await db
    .insert(marketingJobs)
    .values({ key, ranAt: NEVER, data, updatedAt })
    .onConflictDoUpdate({ target: marketingJobs.key, set: { data, updatedAt } });
}
