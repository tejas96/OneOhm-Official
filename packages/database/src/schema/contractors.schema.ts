import { RATE_BASES } from '@oneohm/domain';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { projectTypeEnum } from './enums';
import { payables } from './finance.schema';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';

export const contractorKindEnum = pgEnum('contractor_kind', ['company', 'individual']);
export const contractorRateBasisEnum = pgEnum('contractor_rate_basis', RATE_BASES);
export const workOrderStatusEnum = pgEnum('work_order_status', [
  'open',
  'in_progress',
  'completed',
  'cancelled',
]);

/** I&C partners and labour contractors (PRD 3.13). */
export const contractors = pgTable(
  'contractors',
  {
    id: primaryId(),
    name: text('name').notNull(),
    kind: contractorKindEnum('kind').notNull().default('company'),
    contactName: text('contact_name'),
    phoneE164: text('phone_e164'),
    email: text('email'),
    gstin: text('gstin'),
    pan: text('pan'),
    address: text('address'),
    bankAccountName: text('bank_account_name'),
    bankAccountNumber: text('bank_account_number'),
    bankIfsc: text('bank_ifsc'),
    paymentTermsDays: integer('payment_terms_days').notNull().default(15),
    /** TDS withheld, in basis points (100 = 1%); null follows the company's tax setting. */
    tdsBp: integer('tds_bp'),
    /** Held back until the defect period ends, in basis points. */
    retentionBp: integer('retention_bp').notNull().default(0),
    retentionDays: integer('retention_days').notNull().default(90),
    /** Role keys this contractor's crews can take, e.g. ic_partner. */
    skills: text('skills').array().notNull(),
    serviceAreas: text('service_areas').array().notNull(),
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('contractors_name_unique').on(table.name)],
);

/** Crew members are users (partner-kind role) who belong to one contractor. */
export const contractorMembers = pgTable(
  'contractor_members',
  {
    contractorId: uuid('contractor_id')
      .notNull()
      .references(() => contractors.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lead: boolean('lead').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.contractorId, table.userId] }),
    uniqueIndex('contractor_members_user_unique').on(table.userId),
  ],
);

export const contractorRates = pgTable(
  'contractor_rates',
  {
    id: primaryId(),
    contractorId: uuid('contractor_id')
      .notNull()
      .references(() => contractors.id, { onDelete: 'cascade' }),
    basis: contractorRateBasisEnum('basis').notNull(),
    taskKey: text('task_key'),
    projectType: projectTypeEnum('project_type'),
    label: text('label').notNull(),
    amountPaise: money('amount_paise').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('contractor_rates_contractor_idx').on(table.contractorId)],
);

/** One per contractor and project: the tasks they do there and what they are paid. */
export const workOrders = pgTable(
  'work_orders',
  {
    id: primaryId(),
    number: text('number').notNull(),
    contractorId: uuid('contractor_id')
      .notNull()
      .references(() => contractors.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: workOrderStatusEnum('status').notNull().default('open'),
    scope: text('scope'),
    dueDate: calendarDate('due_date'),
    startedAt: instant('started_at'),
    completedAt: instant('completed_at'),
    cancelledReason: text('cancelled_reason'),
    grossPaise: money('gross_paise').notNull().default(0),
    reworkDeductionsPaise: money('rework_deductions_paise').notNull().default(0),
    retentionPaise: money('retention_paise').notNull().default(0),
    tdsPaise: money('tds_paise').notNull().default(0),
    /** TDS rate set when the order was issued; null on older orders (the contractor's). */
    tdsBp: integer('tds_bp'),
    advancesPaise: money('advances_paise').notNull().default(0),
    netPayablePaise: money('net_payable_paise').notNull().default(0),
    payableId: uuid('payable_id').references(() => payables.id),
    retentionPayableId: uuid('retention_payable_id').references(() => payables.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('work_orders_number_unique').on(table.number),
    index('work_orders_contractor_idx').on(table.contractorId),
    index('work_orders_project_idx').on(table.projectId),
  ],
);

export const workOrderTasks = pgTable(
  'work_order_tasks',
  {
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.workOrderId, table.taskId] }),
    uniqueIndex('work_order_tasks_task_unique').on(table.taskId),
  ],
);

export const workOrderLines = pgTable(
  'work_order_lines',
  {
    id: primaryId(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    rateId: uuid('rate_id').references(() => contractorRates.id, { onDelete: 'set null' }),
    basis: contractorRateBasisEnum('basis').notNull(),
    taskKey: text('task_key'),
    description: text('description').notNull(),
    quantityMilli: integer('quantity_milli').notNull(),
    unitRatePaise: money('unit_rate_paise').notNull(),
    amountPaise: money('amount_paise').notNull(),
    /** Added by hand (per-day labour, extras); kept when the rate lines are recalculated. */
    manual: boolean('manual').notNull().default(false),
    position: integer('position').notNull(),
  },
  (table) => [index('work_order_lines_order_idx').on(table.workOrderId)],
);

/** Rework recorded against a work order, with any deduction from the payout. */
export const workOrderRework = pgTable(
  'work_order_rework',
  {
    id: primaryId(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => projectTasks.id, { onDelete: 'set null' }),
    note: text('note').notNull(),
    deductionPaise: money('deduction_paise').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index('work_order_rework_order_idx').on(table.workOrderId)],
);

/** Advances paid before the work is done; each is also a contractor payable. */
export const workOrderAdvances = pgTable('work_order_advances', {
  id: primaryId(),
  workOrderId: uuid('work_order_id')
    .notNull()
    .references(() => workOrders.id, { onDelete: 'cascade' }),
  payableId: uuid('payable_id')
    .notNull()
    .references(() => payables.id),
  amountPaise: money('amount_paise').notNull(),
  note: text('note'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: createdAt(),
});
