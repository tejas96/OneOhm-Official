import { isBalanced, type JournalLine } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { journalEntries, journalLines, type journalSourceEnum } from '../schema';

export type JournalSource = (typeof journalSourceEnum.enumValues)[number];

export interface JournalPosting {
  readonly entryDate: string;
  readonly memo: string;
  readonly sourceType: JournalSource;
  readonly sourceId: string;
  readonly projectId?: string | null;
  readonly reversesEntryId?: string | null;
  readonly postedByUserId?: string | null;
  readonly lines: readonly JournalLine[];
}

/**
 * Writes one balanced journal entry. The same source is posted at most once: a repeat
 * returns null and writes nothing, so posting is safe to retry and to backfill.
 * Call it inside the transaction that makes the business change.
 */
export async function postJournal(
  db: DatabaseExecutor,
  posting: JournalPosting,
): Promise<string | null> {
  if (!isBalanced(posting.lines)) {
    throw new Error(`Unbalanced journal entry for ${posting.sourceType} ${posting.sourceId}.`);
  }
  // Look first so a repeat never uses up an entry number (JV numbers stay gap-free);
  // the unique index still guards against two posts racing.
  const [existing] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceType, posting.sourceType),
        eq(journalEntries.sourceId, posting.sourceId),
      ),
    )
    .limit(1);
  if (existing) return null;
  const [entry] = await db
    .insert(journalEntries)
    .values({
      entryDate: posting.entryDate,
      memo: posting.memo,
      sourceType: posting.sourceType,
      sourceId: posting.sourceId,
      projectId: posting.projectId ?? null,
      reversesEntryId: posting.reversesEntryId ?? null,
      postedByUserId: posting.postedByUserId ?? null,
    })
    .onConflictDoNothing({ target: [journalEntries.sourceType, journalEntries.sourceId] })
    .returning({ id: journalEntries.id });
  if (!entry) return null;
  await db.insert(journalLines).values(
    posting.lines.map((line, position) => ({
      entryId: entry.id,
      accountCode: line.account,
      debitPaise: line.debitPaise,
      creditPaise: line.creditPaise,
      position,
    })),
  );
  return entry.id;
}
