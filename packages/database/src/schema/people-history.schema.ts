import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, money, primaryId } from './columns';
import { users } from './identity.schema';

/**
 * Each time a person left the team or came back (Remove from team, Add back), so the month
 * sheet knows the days between were not employment. Never edited.
 */
export const employmentEvents = pgTable(
  'employment_events',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['left', 'rejoined'] }).notNull(),
    /** The last working day (left) or the first day back (rejoined). */
    day: calendarDate('day').notNull(),
    byUserId: uuid('by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [index('employment_events_user_idx').on(table.userId, table.createdAt)],
);

/**
 * Every change to a person's monthly pay, from the day it was made (Duty Day step 7). The
 * month sheet pays each month with the pay in force then; the first pay saved also covers the
 * months before it. Readable only where the pay itself is.
 */
export const payHistory = pgTable(
  'pay_history',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null when the pay was cleared. */
    monthlyPayPaise: money('monthly_pay_paise'),
    effectiveFrom: calendarDate('effective_from').notNull(),
    setByUserId: uuid('set_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [index('pay_history_user_idx').on(table.userId, table.effectiveFrom)],
);
