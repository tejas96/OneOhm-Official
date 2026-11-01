import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from './columns';

/**
 * Payment terms owners can set (PRD 3.7, 7.2): named plans of customer milestones, each a
 * share in basis points and the event that makes it due. One plan is the default; a
 * project can use another. The bank's share of a loan is always its own milestone.
 */
export const paymentPlans = pgTable('payment_plans', {
  id: primaryId(),
  name: text('name').notNull(),
  steps: jsonb('steps').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
