import { Inject, Injectable } from '@nestjs/common';
import type { JobRunRecord, JobRunsView } from '@oneohm/api-contracts';
import { jobRuns } from '@oneohm/database';
import { compareRuns, isRetryableJob, JOB_NAMES, type JobName } from '@oneohm/domain';
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

type Row = typeof jobRuns.$inferSelect;
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
    const rows = await this.db
      .select()
      .from(jobRuns)
      .where(gte(jobRuns.createdAt, since))
      .orderBy(desc(jobRuns.createdAt))
      .limit(400);
    const retriedIds = new Set(
      rows.flatMap((row) => (row.retryOfId && row.trigger === 'retry' ? [row.retryOfId] : [])),
    );
    const weekAgo = Date.now() - 7 * 86_400_000;
    const runs = rows
      .filter((row) => isJob(row.name))
      .map((row) => present(row, retriedIds.has(row.id)))
      .sort(compareRuns)
      .slice(0, SHOWN);
    // A failure put right by a retry no longer needs anyone's attention.
    const fixed = new Set(
      rows.flatMap((row) => (row.status === 'succeeded' && row.retryOfId ? [row.retryOfId] : [])),
    );
    const failedLastWeek = rows.filter(
      (row) => row.status === 'failed' && row.createdAt.getTime() >= weekAgo && !fixed.has(row.id),
    ).length;
    return { runs, failedLastWeek };
  }

  /** Queues a failed job to run again; the worker picks it up within a minute. */
  async retry(actor: Actor, id: string): Promise<JobRunRecord> {
    const [failed] = await this.db.select().from(jobRuns).where(eq(jobRuns.id, id));
    if (!failed) throw notFound('That run');
    if (failed.status !== 'failed') throw conflict('Only a failed run can be tried again.');
    if (!isRetryableJob(failed.name))
      throw conflict('This job runs again on its own within minutes.', 'not_retryable');
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
    return present(row, false);
  }
}

function present(row: Row, retried: boolean): JobRunRecord {
  return {
    id: row.id,
    name: row.name as JobName,
    trigger: row.trigger,
    status: row.status,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    result: row.result,
    error: row.error,
    retryable: row.status === 'failed' && isRetryableJob(row.name) && !retried,
    retried,
    createdAt: row.createdAt.toISOString(),
  };
}
