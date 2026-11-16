import type { MonthRow } from '@oneohm/domain';
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { users } from './identity.schema';

/** One unlock of a locked month, kept forever with who did it and why. */
export interface MonthUnlock {
  readonly at: string;
  readonly byUserId: string;
  readonly reason: string;
}

/**
 * A month's sheet for salary (Duty Day step 7). A month has no row here until it is first
 * locked: while open, the sheet is built from the facts on every read. Locking freezes each
 * person's row (`month_sheet_rows`); unlocking keeps the frozen rows for history and the
 * reason in `unlocks`.
 */
export const monthSheets = pgTable('month_sheets', {
  id: primaryId(),
  /** Business month, `YYYY-MM`. */
  month: text('month').notNull().unique('month_sheets_month_unique'),
  status: text('status', { enum: ['open', 'locked'] }).notNull(),
  lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
  lockedAt: instant('locked_at'),
  unlocks: jsonb('unlocks').$type<MonthUnlock[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * One person's numbers as they were frozen at lock (or at "Refresh row"). The breakdown is
 * the whole computed row (days, counts, money, flags), so the sheet can show what changed.
 */
export const monthSheetRows = pgTable(
  'month_sheet_rows',
  {
    id: primaryId(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => monthSheets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    breakdown: jsonb('breakdown').$type<MonthRow>().notNull(),
    frozenAt: instant('frozen_at').notNull().defaultNow(),
    /** Who refreshed the row after lock; null when it was frozen by the lock itself. */
    refreshedBy: uuid('refreshed_by').references(() => users.id, { onDelete: 'set null' }),
    /**
     * The change after lock HR was last told about (a hash of what differs), so the daily check
     * tells once per change, not every day. Cleared when the row is frozen again.
     */
    toldChange: text('told_change'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('month_sheet_rows_sheet_user_unique').on(table.sheetId, table.userId),
    index('month_sheet_rows_user_idx').on(table.userId),
  ],
);
