import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, money, primaryId } from './columns';
import { paymentMilestones } from './finance.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/**
 * A discount the customer earned (the self-survey discount), GST inclusive. `applied`: taken off a customer
 * instalment that had not fallen due, in the same transaction, so the ledger books the reduced amount when it
 * falls due. `pending`: no instalment could take it; finance is told and it is applied later or settled by
 * hand (`paid_out`, with a reason). `reversed` keeps the row and gives the amount back. One live (not
 * reversed) credit per source and project: a project earns it once, however many surveys are sent.
 * Audit rows: entity `milestone_credit`.
 */
export const milestoneCredits = pgTable(
  'milestone_credits',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** The instalment it was taken off; empty while pending or when paid out by hand. */
    milestoneId: uuid('milestone_id').references(() => paymentMilestones.id, {
      onDelete: 'cascade',
    }),
    status: text('status', { enum: ['pending', 'applied', 'reversed', 'paid_out'] })
      .notNull()
      .default('applied'),
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
    /** When finance settled a pending credit by hand: when, by whom and why. */
    settledAt: instant('settled_at'),
    settledByUserId: uuid('settled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    settleNote: text('settle_note'),
    createdAt: createdAt(),
  },
  (table) => [
    index('milestone_credits_milestone_idx').on(table.milestoneId),
    uniqueIndex('milestone_credits_live_unique')
      .on(table.source, table.projectId)
      .where(sql`${table.status} <> 'reversed'`),
  ],
);
