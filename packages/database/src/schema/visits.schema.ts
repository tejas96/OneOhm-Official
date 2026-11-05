import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amcVisits } from './after-sales.schema';
import { calendarDate, createdAt, instant, primaryId, updatedAt } from './columns';
import { customers, leads, properties } from './crm.schema';
import { serviceRequests } from './customer-portal.schema';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';

export const visitKindEnum = pgEnum('visit_kind', [
  'survey',
  'installation',
  'inspection',
  'net_meter',
  'amc',
  'service',
]);
export const visitStatusEnum = pgEnum('visit_status', [
  'proposed',
  'confirmed',
  'done',
  'cancelled',
  'missed',
]);

/**
 * One day the team visits a customer's home (redesign §8): survey, installation, DISCOM
 * inspection, net meter, AMC or service. The customer's pick is `proposed` until the team
 * confirm it. A service request's own visit day mirrors the open visit. Audit rows: entity
 * `visit`, actions `visit.*`.
 */
export const visits = pgTable(
  'visits',
  {
    id: primaryId(),
    kind: visitKindEnum('kind').notNull(),
    status: visitStatusEnum('status').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    serviceRequestId: uuid('service_request_id').references(() => serviceRequests.id, {
      onDelete: 'cascade',
    }),
    amcVisitId: uuid('amc_visit_id').references(() => amcVisits.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => projectTasks.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    day: calendarDate('day').notNull(),
    slot: text('slot', { enum: ['morning', 'afternoon'] }).notNull(),
    /** The people who come; the first one is the contact the customer is given. */
    crewUserIds: uuid('crew_user_ids').array().notNull().default(sql`'{}'::uuid[]`),
    proposedBy: text('proposed_by', { enum: ['customer', 'staff'] }).notNull(),
    proposedByUserId: uuid('proposed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedByUserId: uuid('confirmed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedAt: instant('confirmed_at'),
    /** The customer answered [Confirm] / [I'll be there]. */
    customerConfirmedAt: instant('customer_confirmed_at'),
    /** The customer said they cannot be there that day (a DISCOM date). */
    customerCannotAt: instant('customer_cannot_at'),
    /** When the customer was told the day (a DISCOM presence ask), for the 1-day check. */
    toldAt: instant('told_at'),
    reminderSentAt: instant('reminder_sent_at'),
    unconfirmedAlertAt: instant('unconfirmed_alert_at'),
    doneAt: instant('done_at'),
    missedAt: instant('missed_at'),
    cancelledAt: instant('cancelled_at'),
    cancelReason: text('cancel_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('visits_customer_idx').on(table.customerId, table.status),
    index('visits_day_idx').on(table.day, table.status),
    // One open visit per task, per service request and per lead survey.
    uniqueIndex('visits_one_open_task')
      .on(table.taskId)
      .where(sql`${table.status} in ('proposed','confirmed') and ${table.taskId} is not null`),
    uniqueIndex('visits_one_open_service')
      .on(table.serviceRequestId)
      .where(
        sql`${table.status} in ('proposed','confirmed') and ${table.serviceRequestId} is not null`,
      ),
    uniqueIndex('visits_one_open_lead')
      .on(table.leadId, table.kind)
      .where(
        sql`${table.status} in ('proposed','confirmed') and ${table.leadId} is not null and ${table.taskId} is null and ${table.serviceRequestId} is null`,
      ),
  ],
);
