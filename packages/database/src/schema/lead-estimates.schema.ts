import { doublePrecision, index, integer, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt, money, primaryId } from './columns';
import { leads } from './crm.schema';

/**
 * The instant estimate the WhatsApp bot sent a lead. It is an estimate, never a quotation:
 * `answers` holds what the customer told us and `priced` the priced preview as it was sent,
 * so staff can see exactly what the customer saw.
 */
export const leadEstimates = pgTable(
  'lead_estimates',
  {
    id: primaryId(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    capacityWp: integer('capacity_wp'),
    moduleCount: integer('module_count'),
    totalPaise: money('total_paise'),
    subsidyPaise: money('subsidy_paise'),
    effectivePaise: money('effective_paise'),
    monthlySavingPaise: money('monthly_saving_paise'),
    paybackYears: doublePrecision('payback_years'),
    answers: jsonb('answers').notNull(),
    priced: jsonb('priced').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('lead_estimates_lead_idx').on(table.leadId)],
);
