import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, money, primaryId } from './columns';
import { paymentMilestones } from './finance.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/**
 * A credit taken off a customer instalment that has not fallen due yet (the self-survey discount).
 * The instalment's amount is reduced by `amountPaise` in the same transaction, so the ledger books the
 * reduced amount when it falls due. One live credit per source (`source` + `source_id`): applying the
 * same approval twice is refused by the index. Reversing keeps the row (`reversed_at`) and gives the
 * amount back while the instalment is still upcoming. Audit rows: entity `milestone_credit`.
 */
export const milestoneCredits = pgTable(
  'milestone_credits',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    milestoneId: uuid('milestone_id')
      .notNull()
      .references(() => paymentMilestones.id, { onDelete: 'cascade' }),
    amountPaise: money('amount_paise').notNull(),
    /** What earned it, e.g. `self_survey`, and that record's id (the customer action). */
    source: text('source').notNull(),
    sourceId: uuid('source_id').notNull(),
    appliedByUserId: uuid('applied_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reversedAt: instant('reversed_at'),
    reversedByUserId: uuid('reversed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reverseReason: text('reverse_reason'),
    createdAt: createdAt(),
  },
  (table) => [
    index('milestone_credits_milestone_idx').on(table.milestoneId),
    uniqueIndex('milestone_credits_live_unique')
      .on(table.source, table.sourceId)
      .where(sql`${table.reversedAt} is null`),
  ],
);
