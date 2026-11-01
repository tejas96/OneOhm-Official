import type { PatternPart } from '@oneohm/domain';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, money, primaryId, updatedAt, version } from './columns';
import { payments } from './finance.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

export const loanStatusEnum = pgEnum('loan_status', [
  'collecting_documents',
  'submitted',
  'sanctioned',
  'disbursing',
  'disbursed',
  'rejected',
]);
export const trancheStatusEnum = pgEnum('loan_tranche_status', ['planned', 'claimed', 'received']);

/** A document a lender needs, ticked off as it arrives. */
export interface LoanDocument {
  readonly name: string;
  readonly received: boolean;
}

/** Banks and NBFCs OneOhm works with, each with its documents and disbursement pattern. */
export const lendingPartners = pgTable(
  'lending_partners',
  {
    id: primaryId(),
    name: text('name').notNull(),
    requiredDocuments: jsonb('required_documents').$type<string[]>().notNull().default([]),
    disbursement: text('disbursement', { enum: ['single', 'tranches'] })
      .notNull()
      .default('single'),
    /** For a parts lender: each part's name and share; new loans plan tranches by it. */
    tranchePattern: jsonb('tranche_pattern').$type<PatternPart[]>().notNull().default([]),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('lending_partners_name_unique').on(table.name)],
);

/**
 * Bank finance for one project (PRD 3.11, Flow B). The bank's share is the project's
 * bank milestone; disbursements are recorded as payments against it.
 */
export const projectLoans = pgTable(
  'project_loans',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    lendingPartnerId: uuid('lending_partner_id').references(() => lendingPartners.id),
    lenderName: text('lender_name').notNull(),
    applicationNumber: text('application_number'),
    sanctionedPaise: money('sanctioned_paise'),
    sanctionedOn: calendarDate('sanctioned_on'),
    status: loanStatusEnum('status').notNull().default('collecting_documents'),
    documents: jsonb('documents').$type<LoanDocument[]>().notNull().default([]),
    notes: text('notes'),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('project_loans_project_unique').on(table.projectId)],
);

/** Planned parts of the bank disbursement; a received tranche points at its payment. */
export const loanTranches = pgTable(
  'loan_tranches',
  {
    id: primaryId(),
    loanId: uuid('loan_id')
      .notNull()
      .references(() => projectLoans.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    amountPaise: money('amount_paise').notNull(),
    expectedOn: calendarDate('expected_on'),
    status: trancheStatusEnum('status').notNull().default('planned'),
    claimedOn: calendarDate('claimed_on'),
    paymentId: uuid('payment_id').references(() => payments.id),
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('loan_tranches_loan_idx').on(table.loanId)],
);
