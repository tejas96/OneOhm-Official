import { type Database, jobRuns, outbox, recordJobRun } from '@oneohm/database';
import { and, asc, eq } from 'drizzle-orm';
import { isWorkerJob, jobRunners } from '../activities/job-runners';

const BATCH = 5;

/**
 * Runs the retries people ask for in Settings → Automation runs (PRD 7.1). The API only
 * queues a row; this loop claims it, runs the job again and records the outcome there.
 * A failed message goes back to the outbox, so the relay sends it again.
 */
export class JobRetryLoop {
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private readonly jobs: ReturnType<typeof jobRunners>;

  constructor(
    private readonly db: Database,
    timeZone: string,
    private readonly pollMs: number,
    private readonly log: (line: string) => void,
  ) {
    this.jobs = jobRunners(db, timeZone);
  }

  start(): void {
    const loop = async () => {
      if (this.stopped) return;
      this.running = this.tick().then(
        () => undefined,
        (error: unknown) => {
          this.log(`[retry] ${error instanceof Error ? error.message : String(error)}`);
        },
      );
      await this.running;
      if (!this.stopped) this.timer = setTimeout(loop, this.pollMs);
    };
    void loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  async tick(): Promise<number> {
    const queued = await this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.status, 'queued'))
      .orderBy(asc(jobRuns.createdAt))
      .limit(BATCH);
    let ran = 0;
    for (const row of queued) {
      // Claim it, so a second worker never runs the same retry.
      const [claimed] = await this.db
        .update(jobRuns)
        .set({ status: 'running', startedAt: new Date() })
        .where(and(eq(jobRuns.id, row.id), eq(jobRuns.status, 'queued')))
        .returning({ id: jobRuns.id });
      if (!claimed) continue;
      await this.runOne(row.id, row.name, row.subjectId).catch((error: unknown) => {
        this.log(`[retry] ${row.name} failed again: ${String(error)}`);
      });
      ran += 1;
    }
    if (ran > 0) this.log(`[retry] ran ${ran} retries`);
    return ran;
  }

  private async runOne(runId: string, name: string, subjectId: string | null): Promise<void> {
    const options = { runId, trigger: 'retry' as const };
    if (name === 'message_delivery') {
      await recordJobRun(
        this.db,
        'message_delivery',
        () => this.resend(subjectId),
        String,
        options,
      );
      return;
    }
    if (!isWorkerJob(name, this.jobs)) {
      await this.db
        .update(jobRuns)
        .set({ status: 'failed', finishedAt: new Date(), error: 'This job cannot be run by hand.' })
        .where(eq(jobRuns.id, runId));
      return;
    }
    await recordJobRun(this.db, name, this.jobs[name], String, options);
  }

  /** Puts a failed message back in the outbox; the relay sends it within seconds. */
  private async resend(outboxId: string | null): Promise<number> {
    if (!outboxId) throw new Error('The message is no longer known.');
    const back = await this.db
      .update(outbox)
      .set({ status: 'pending', attempts: 0, lastError: null })
      .where(and(eq(outbox.id, outboxId), eq(outbox.status, 'failed')))
      .returning({ id: outbox.id });
    if (back.length === 0) throw new Error('The message was already sent or is no longer failed.');
    return back.length;
  }
}
