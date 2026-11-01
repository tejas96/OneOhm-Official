import { type Database, outbox } from '@oneohm/database';
import { type Client, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { and, asc, eq } from 'drizzle-orm';

const BATCH = 50;

/**
 * Hands each new outbox row to its own delivery workflow. The workflow ID is the row
 * ID, so running two relays (or restarting) never sends a message twice.
 */
export class OutboxRelay {
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    private readonly db: Database,
    private readonly client: Client,
    private readonly taskQueue: string,
    private readonly pollMs: number,
    private readonly log: (line: string) => void,
  ) {}

  start(): void {
    const loop = async () => {
      if (this.stopped) return;
      this.running = this.tick().then(
        () => undefined,
        (error: unknown) => {
          this.log(`[relay] ${error instanceof Error ? error.message : String(error)}`);
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
    const rows = await this.db
      .select({ id: outbox.id })
      .from(outbox)
      .where(and(eq(outbox.status, 'pending'), eq(outbox.attempts, 0)))
      .orderBy(asc(outbox.createdAt))
      .limit(BATCH);
    let started = 0;
    for (const row of rows) {
      try {
        await this.client.workflow.start('deliverMessageWorkflow', {
          workflowId: `outbox-${row.id}`,
          taskQueue: this.taskQueue,
          args: [row.id],
        });
        started += 1;
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      }
    }
    if (started > 0) this.log(`[relay] started ${started} deliveries`);
    return started;
  }
}
