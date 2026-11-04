import { Inject, Injectable } from '@nestjs/common';
import type { JobRunRecord, JobRunsView } from '@oneohm/api-contracts';
import { expireStaleRetries, jobRuns, users } from '@oneohm/database';
import {
  compareRuns,
  isRetryableJob,
  JOB_NAMES,
  type JobName,
  missingDailyJobs,
  recoveredFailures,
} from '@oneohm/domain';
import { and, desc, eq, gte, inArray, isNotNull, max } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

type Row = typeof jobRuns.$inferSelect;
interface Listed {
  readonly run: Row;
  readonly requester: string | null;
}
const SHOWN = 120;
const iso = (value: Date | null) => value?.toISOString() ?? null;
const isJob = (name: string): name is JobName => (JOB_NAMES as readonly string[]).includes(name);

/**
 * The automatic jobs' recent runs (PRD 7.1 "workflow history and failure visibility"):
 * failures first, then the newest, with a retry for jobs that are safe to run again.
 */
@Injectable()
export class JobRunsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<JobRunsView> {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const listed: Listed[] = await this.db
      .select({ run: jobRuns, requester: users.fullName })
      .from(jobRuns)
      .leftJoin(users, eq(users.id, jobRuns.requestedByUserId))
      .where(gte(jobRuns.createdAt, since))
      .orderBy(desc(jobRuns.createdAt))
      .limit(400);
    const rows = listed.map((item) => item.run);
    const requesters = new Map(listed.map((item) => [item.run.id, item.requester]));
    const retriedIds = new Set(
      rows.flatMap((row) => (row.retryOfId && row.trigger === 'retry' ? [row.retryOfId] : [])),
    );
    const weekAgo = Date.now() - 7 * 86_400_000;
    // A failure the same job put right later (its own retry, the next tick, a retry by
    // hand) no longer needs anyone's attention.
    const recovered = recoveredFailures(rows);
    const runs = rows
      .filter((row) => isJob(row.name))
      .map((row) =>
        present(row, {
          retried: retriedIds.has(row.id),
          recovered: recovered.has(row.id),
          requesterName: requesters.get(row.id) ?? null,
        }),
      )
      .sort(compareRuns)
      .slice(0, SHOWN);
    const failedLastWeek = rows.filter(
      (row) =>
        row.status === 'failed' && row.createdAt.getTime() >= weekAgo && !recovered.has(row.id),
    ).length;
    return { runs, failedLastWeek, missingDaily: [...(await this.missingDaily())] };
  }

  /** Daily jobs with no run for over a day: nothing records when the worker is stopped. */
  private async missingDaily(): Promise<readonly JobName[]> {
    const latest = await this.db
      .select({ name: jobRuns.name, at: max(jobRuns.createdAt) })
      .from(jobRuns)
      .where(gte(jobRuns.createdAt, new Date(Date.now() - 2 * 86_400_000)))
      .groupBy(jobRuns.name);
    return missingDailyJobs(
      new Map(latest.flatMap((row) => (row.at ? [[row.name, row.at] as const] : []))),
    );
  }

  /** Queues a failed job to run again; the worker picks it up within a minute. */
  async retry(actor: Actor, id: string): Promise<JobRunRecord> {
    const [failed] = await this.db.select().from(jobRuns).where(eq(jobRuns.id, id));
    if (!failed) throw notFound('That run');
    if (failed.status !== 'failed') throw conflict('Only a failed run can be tried again.');
    if (!isRetryableJob(failed.name))
      throw conflict('This job runs again on its own within minutes.', 'not_retryable');
    // A retry still waiting after an hour was never picked up; it no longer blocks one.
    await expireStaleRetries(this.db);
    const [waiting] = await this.db
      .select({ id: jobRuns.id })
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.retryOfId, id),
          inArray(jobRuns.status, ['queued', 'running']),
          isNotNull(jobRuns.retryOfId),
        ),
      )
      .limit(1);
    if (waiting) throw conflict('A retry is already waiting for this run.', 'retry_waiting');
    const row = await this.db.transaction(async (tx) => {
      const [queued] = await tx
        .insert(jobRuns)
        .values({
          name: failed.name,
          trigger: 'retry',
          status: 'queued',
          retryOfId: failed.id,
          subjectId: failed.subjectId,
          requestedByUserId: actor.userId,
        })
        .returning();
      if (!queued) throw new Error('Retry insert returned nothing.');
      await recordAudit(tx, actor.userId, 'job.retry_requested', 'job_run', failed.id, {
        name: failed.name,
      });
      return queued;
    });
    return present(row, { retried: false, recovered: false, requesterName: actor.fullName });
  }
}

function present(
  row: Row,
  facts: { readonly retried: boolean; readonly recovered: boolean; requesterName: string | null },
): JobRunRecord {
  const { retried, recovered, requesterName } = facts;
  return {
    id: row.id,
    name: row.name as JobName,
    trigger: row.trigger,
    status: row.status,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    result: row.result,
    error: row.error,
    retryable: row.status === 'failed' && isRetryableJob(row.name) && !retried && !recovered,
    retried,
    recovered,
    retryOfId: row.retryOfId,
    subjectId: row.subjectId,
    requestedBy:
      row.requestedByUserId && requesterName
        ? { id: row.requestedByUserId, name: requesterName }
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}
