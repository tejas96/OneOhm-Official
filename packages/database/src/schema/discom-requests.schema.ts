import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { discoms } from './catalog.schema';
import { calendarDate, createdAt, instant, primaryId, updatedAt } from './columns';
import { customers, properties } from './crm.schema';
import { changeRequestTypes } from './discom-setup.schema';
import { waitingPartyEnum } from './enums';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';

export const changeRequestStatusEnum = pgEnum('change_request_status', [
  'open',
  'completed',
  'cancelled',
]);
export const changeRequestStepStatusEnum = pgEnum('change_request_step_status', [
  'pending',
  'ready',
  'in_progress',
  'waiting',
  'completed',
]);

/**
 * Utility change requests (PRD 3.15): with or without a solar project. The property is
 * updated when the last step completes; the replaced values stay in `previousValues`.
 */
export const changeRequests = pgTable(
  'change_requests',
  {
    id: primaryId(),
    number: text('number').notNull(),
    /** The type's key, e.g. `load_change`; its DISCOM's definition is `typeId`. */
    type: text('type').notNull(),
    typeId: uuid('type_id').references(() => changeRequestTypes.id, { onDelete: 'set null' }),
    status: changeRequestStatusEnum('status').notNull().default('open'),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    discomId: uuid('discom_id').references(() => discoms.id),
    values: jsonb('values').$type<Record<string, string>>().notNull(),
    captured: jsonb('captured').$type<Record<string, string>>().notNull().default({}),
    previousValues: jsonb('previous_values').$type<Record<string, unknown>>(),
    appliedValues: jsonb('applied_values').$type<Record<string, unknown>>(),
    /** The DISCOM's application or reference number, once there is one. */
    referenceNumber: text('reference_number'),
    note: text('note'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    completedAt: instant('completed_at'),
    cancelledReason: text('cancelled_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('change_requests_number_unique').on(table.number),
    index('change_requests_property_idx').on(table.propertyId),
    index('change_requests_project_idx').on(table.projectId),
  ],
);

/** The DISCOM steps of one change request, worked like project tasks. */
export const changeRequestSteps = pgTable(
  'change_request_steps',
  {
    id: primaryId(),
    changeRequestId: uuid('change_request_id')
      .notNull()
      .references(() => changeRequests.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    title: text('title').notNull(),
    roleKey: text('role_key').notNull(),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: changeRequestStepStatusEnum('status').notNull().default('pending'),
    waitingParty: waitingPartyEnum('waiting_party').notNull().default('internal'),
    captures: text('captures').array().notNull(),
    dueDate: calendarDate('due_date').notNull(),
    startedAt: instant('started_at'),
    waitingSince: instant('waiting_since'),
    completedAt: instant('completed_at'),
    completedByUserId: uuid('completed_by_user_id').references(() => users.id),
    nextFollowUpOn: calendarDate('next_follow_up_on'),
    note: text('note'),
    position: integer('position').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('change_request_steps_request_idx').on(table.changeRequestId)],
);

/** DISCOM follow-up details for a waiting project task (reference number, next call). */
export const discomFollowUps = pgTable('discom_follow_ups', {
  taskId: uuid('task_id')
    .primaryKey()
    .references(() => projectTasks.id, { onDelete: 'cascade' }),
  referenceNumber: text('reference_number'),
  office: text('office'),
  nextFollowUpOn: calendarDate('next_follow_up_on'),
  note: text('note'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
  updatedAt: updatedAt(),
});
