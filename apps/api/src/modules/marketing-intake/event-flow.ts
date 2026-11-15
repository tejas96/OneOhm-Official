import { type DatabaseExecutor, marketingEvents } from '@oneohm/database';
import { PlatformError } from '@oneohm/marketing';
import { NoLeadTaker } from '../crm/lead-intake.service';

/** A failure that waiting will not fix, in words the leads desk can act on. */
export class PermanentEventError extends Error {
  constructor(
    message: string,
    /** Which alert to raise: the lead form could not be read, or nobody can take the lead. */
    readonly kind: 'unreadable' | 'nobody' = 'unreadable',
  ) {
    super(message);
    this.name = 'PermanentEventError';
  }
}

/**
 * Plain words when a failure is one waiting cannot fix (Meta not connected, a refusal that
 * will not change, nobody to take leads); null for one a resend can fix (database down,
 * Meta not reachable, a retryable refusal).
 */
export function permanentReason(error: unknown): PermanentEventError | null {
  if (error instanceof PermanentEventError) return error;
  if (error instanceof NoLeadTaker) return new PermanentEventError(error.message, 'nobody');
  if (error instanceof PlatformError && !error.retryable)
    return new PermanentEventError(error.message);
  return null;
}

/** True when this call took the key: nobody handled the event before. Run inside the work's transaction. */
export async function claimEvent(tx: DatabaseExecutor, key: string): Promise<boolean> {
  const rows = await tx
    .insert(marketingEvents)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: marketingEvents.key });
  return rows.length > 0;
}

/** What to do with one kind of webhook event. */
export interface EventWork<E extends { readonly key: string }, P> {
  /** The slow outside calls (Meta, Graph): done before any transaction opens. */
  prepare(event: E): Promise<P>;
  /** All the database work, in the transaction that also claims the event. */
  apply(event: E, prepared: P, tx: DatabaseExecutor): Promise<void>;
  /** Alerts the leads desk about a failure waiting cannot fix (the event is then claimed). */
  giveUp(event: E, reason: PermanentEventError, tx: DatabaseExecutor): Promise<void>;
  /** Called for every failure, handled or not. */
  onError(event: E, error: unknown): void;
}

/**
 * Handles each event once. The claim and the work share one transaction: an error undoes
 * both (so Meta's or Google's resend does it again, and a crash after the claim never loses
 * the event), and a resend that arrives mid-work waits for the first to finish. A failure
 * that waiting cannot fix is claimed, alerted once, and counted as handled. `failed` counts
 * the rest; the caller answers 500 when it is above 0.
 */
export async function handleOnce<E extends { readonly key: string }, P>(
  events: readonly E[],
  db: Pick<DatabaseExecutor, 'transaction'>,
  work: EventWork<E, P>,
): Promise<{ handled: number; skipped: number; failed: number }> {
  const result = { handled: 0, skipped: 0, failed: 0 };
  for (const event of events) {
    try {
      const prepared = await work.prepare(event);
      const claimed = await db.transaction(async (tx) => {
        if (!(await claimEvent(tx, event.key))) return false;
        await work.apply(event, prepared, tx);
        return true;
      });
      result[claimed ? 'handled' : 'skipped'] += 1;
    } catch (error) {
      work.onError(event, error);
      const permanent = permanentReason(error);
      if (!permanent) {
        result.failed += 1;
        continue;
      }
      try {
        const claimed = await db.transaction(async (tx) => {
          if (!(await claimEvent(tx, event.key))) return false;
          await work.giveUp(event, permanent, tx);
          return true;
        });
        result[claimed ? 'handled' : 'skipped'] += 1;
      } catch (alertError) {
        work.onError(event, alertError);
        result.failed += 1;
      }
    }
  }
  return result;
}
