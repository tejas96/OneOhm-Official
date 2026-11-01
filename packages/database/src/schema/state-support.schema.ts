import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, money, primaryId } from './columns';

/**
 * A state's own support for low-income households, on top of PM Surya Ghar (PRD 3.5):
 * Maharashtra has no general top-up, only this scheme. Versions by start date, like the
 * central rules; with none, quotations show no state support. Display only, never revenue.
 */
export const stateSubsidyRules = pgTable(
  'state_subsidy_rules',
  {
    id: primaryId(),
    state: text('state').notNull().default('Maharashtra'),
    validFrom: calendarDate('valid_from').notNull(),
    paisePerKw: money('paise_per_kw').notNull(),
    capPaise: money('cap_paise').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('state_subsidy_rules_state_from_unique').on(table.state, table.validFrom),
  ],
);
