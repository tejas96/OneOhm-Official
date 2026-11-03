import { type Database, outbox } from '@oneohm/database';
import { type Client, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { asc, eq } from 'drizzle-orm';

const BATCH = 50;
/** Pending rows read per poll: new ones plus those still being sent or retried. */
const WINDOW = 1000;

/**
 * The rows to start now: each recipient's oldest pending row, unless it is already being
 * sent (or waiting for a retry). So one person's messages arrive in the order queued.
 */
export function nextPerRecipient<T extends { recipient: string; attempts: number }>(
  pending: readonly T[],
): T[] {
  const seen = new Set<string>();
  const ready: T[] = [];
  for (const row of pending) {
    if (seen.has(row.recipient)) continue;
    seen.add(row.recipient);
    if (row.attempts === 0) ready.push(row);
  }
  return ready.slice(0, BATCH);
}

/**
 * Hands each new outbox row to its own delivery workflow. The workflow ID is the row
 * ID, so running two relays (or restarting) never sends a message twice. A recipient's
 * next message starts only once the one before it has finished.
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
    const pending = await this.db
      .select({ id: outbox.id, recipient: outbox.recipient, attempts: outbox.attempts })
      .from(outbox)
      .where(eq(outbox.status, 'pending'))
      .orderBy(asc(outbox.createdAt), asc(outbox.id))
      .limit(WINDOW);
    let started = 0;
    for (const row of nextPerRecipient(pending)) {
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
