import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { outbox } from './schema/records.schema';

type Payload = Readonly<Record<string, string>>;

/** Step updates wait this long, so tasks finished close together go out as one message. */
export const MILESTONE_HOLD_SECONDS = 90;
const MILESTONE = 'project_milestone';
/** A held row is merged into only while its wait has at least this long to run (it may be claimed any moment). */
export const MERGE_MARGIN_SECONDS = 15;
/** Joins the titles in `milestones`; the step keys in `steps` are joined with a comma. */
export const MILESTONE_SEPARATOR = '; ';

/** Whether this customer message waits a little to be merged with its neighbours. */
export const isHeldMessage = (template: string): boolean => template === MILESTONE;

/**
 * One step update with the next one folded in: `milestones` lists every title ("A; B"),
 * `steps` their step keys in the same order (for the customer's language), and `milestone`
 * is the joined text the message says. A title already in the list is not added twice.
 */
export function mergeMilestone(held: Payload, added: Payload): Payload {
  const titles = held.milestones
    ? held.milestones.split(MILESTONE_SEPARATOR)
    : [held.milestone ?? ''];
  const steps = held.steps !== undefined ? held.steps.split(',') : [held.step ?? ''];
  const title = added.milestone ?? '';
  if (titles.includes(title)) return held;
  titles.push(title);
  steps.push(added.step ?? '');
  const milestones = titles.join(MILESTONE_SEPARATOR);
  return { ...held, milestone: milestones, milestones, steps: steps.join(',') };
}

/**
 * The joined step names said in a language: each title with its own step key, so the
 * Marathi or Hindi names come out one by one. `say` turns one title and key into words.
 */
export function sayMilestones(
  payload: Payload,
  say: (title: string, step: string) => string | undefined,
): string | undefined {
  if (!payload.milestones || payload.steps === undefined) return undefined;
  const steps = payload.steps.split(',');
  return payload.milestones
    .split(MILESTONE_SEPARATOR)
    .map((title, index) => say(title, steps[index] ?? '') ?? title)
    .join(MILESTONE_SEPARATOR);
}

/**
 * Folds a step update into the same project's one still held for this person (not yet
 * started, its wait not over), and says whether it did. Rows are locked so two tasks
 * finishing at once cannot both start a message.
 */
export async function mergeIntoHeldMilestone(
  db: DatabaseExecutor,
  recipient: string,
  payload: Payload,
  dedupeKey: string,
): Promise<boolean> {
  if (!payload.project) return false;
  // Already queued (and maybe sent) under this key, or merged into a held message: a repeat.
  const [seen] = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      or(
        eq(outbox.dedupeKey, dedupeKey),
        and(
          eq(outbox.recipient, recipient),
          eq(outbox.template, MILESTONE),
          sql`${outbox.payload} @> ${JSON.stringify({ mergedKeys: [dedupeKey] })}::jsonb`,
        ),
      ),
    )
    .limit(1);
  if (seen) return false;
  // Not started (never claimed by the worker) and not about to be: the worker claims a row
  // atomically, and this lock makes a merge and a claim wait for each other.
  const [held] = await db
    .select({ id: outbox.id, payload: outbox.payload })
    .from(outbox)
    .where(
      and(
        eq(outbox.channel, 'whatsapp'),
        eq(outbox.recipient, recipient),
        eq(outbox.template, MILESTONE),
        eq(outbox.status, 'pending'),
        eq(outbox.attempts, 0),
        isNull(outbox.startedAt),
        gt(
          outbox.notBefore,
          sql`clock_timestamp() + ${MERGE_MARGIN_SECONDS} * interval '1 second'`,
        ),
        sql`${outbox.payload}->>'project' = ${payload.project}`,
      ),
    )
    .orderBy(desc(outbox.createdAt))
    .limit(1)
    .for('update');
  if (!held) return false;
  const before = held.payload as Payload & { readonly mergedKeys?: readonly string[] };
  const merged = {
    ...mergeMilestone(before, payload),
    // Every event folded in is remembered, so a repeat of one is not queued again.
    mergedKeys: [...(before.mergedKeys ?? []), dedupeKey],
  };
  await db.update(outbox).set({ payload: merged }).where(eq(outbox.id, held.id));
  return true;
}

/** A step update held for this person goes out now, before a message queued after it. */
export async function releaseHeldMilestones(
  db: DatabaseExecutor,
  recipient: string,
): Promise<void> {
  await db
    .update(outbox)
    .set({ notBefore: sql`clock_timestamp()` })
    .where(
      and(
        eq(outbox.channel, 'whatsapp'),
        eq(outbox.recipient, recipient),
        eq(outbox.template, MILESTONE),
        eq(outbox.status, 'pending'),
        eq(outbox.attempts, 0),
        gt(outbox.notBefore, sql`clock_timestamp()`),
      ),
    );
}

/** Holds a just-queued message until its wait is over. */
export async function holdMessage(db: DatabaseExecutor, dedupeKey: string): Promise<void> {
  await db
    .update(outbox)
    .set({ notBefore: sql`clock_timestamp() + ${MILESTONE_HOLD_SECONDS} * interval '1 second'` })
    .where(eq(outbox.dedupeKey, dedupeKey));
}
