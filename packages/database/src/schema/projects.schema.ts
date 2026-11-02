import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { discoms } from './catalog.schema';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt, version } from './columns';
import { customers, properties } from './crm.schema';
import {
  epcStageEnum,
  projectStatusEnum,
  projectTypeEnum,
  taskPriorityEnum,
  taskStatusEnum,
  waitingPartyEnum,
} from './enums';
import { users } from './identity.schema';
import { quotations } from './quotations.schema';

/** A project from an accepted quotation to handover and financial closure (PRD 3.6). */
export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id),
    type: projectTypeEnum('type').notNull(),
    discomId: uuid('discom_id')
      .notNull()
      .references(() => discoms.id),
    capacityWp: integer('capacity_wp').notNull(),
    status: projectStatusEnum('status').notNull().default('active'),
    currentStage: epcStageEnum('current_stage').notNull().default('survey'),
    loan: boolean('loan').notNull().default(false),
    lenderName: text('lender_name'),
    loanPaise: money('loan_paise').notNull().default(0),
    battery: boolean('battery').notNull().default(false),
    groundMount: boolean('ground_mount').notNull().default(false),
    subsidy: boolean('subsidy').notNull().default(false),
    nameChange: boolean('name_change').notNull().default(false),
    managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),
    startDate: calendarDate('start_date').notNull(),
    /** When the owner wants it finished, if they set one at creation (PRD 3.8). */
    targetFinishDate: calendarDate('target_finish_date'),
    /**
     * The budget after the site survey (PRD 3.5, Flow A): awaiting_survey, locked,
     * revision_needed while a re-priced revision waits for approval and the customer, or
     * revised once the customer accepted it (also locked).
     */
    budgetStatus: text('budget_status').notNull().default('awaiting_survey'),
    surveyVariancePaise: money('survey_variance_paise'),
    surveyVarianceBp: integer('survey_variance_bp'),
    budgetLockedAt: instant('budget_locked_at'),
    revisionQuotationId: uuid('revision_quotation_id'),
    operationalAt: instant('operational_at'),
    financiallyClosedAt: instant('financially_closed_at'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('projects_code_unique').on(table.code),
    index('projects_customer_idx').on(table.customerId),
  ],
);

export const projectTasks = pgTable(
  'project_tasks',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    templateKey: text('template_key').notNull(),
    title: text('title').notNull(),
    /** The template's description when the task was made. */
    description: text('description'),
    stage: epcStageEnum('stage').notNull(),
    roleKey: text('role_key').notNull(),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** A critical task's suggested person, until a manager confirms (PRD 3.8). */
    proposedUserId: uuid('proposed_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Given outside the project's named team because nobody in it fitted. */
    outsideTeam: boolean('outside_team').notNull().default(false),
    status: taskStatusEnum('status').notNull().default('pending'),
    waitingParty: waitingPartyEnum('waiting_party').notNull().default('internal'),
    /** Set by a manager (spec 3.3); `none` lets the automatic order decide. */
    priority: taskPriorityEnum('priority').notNull().default('none'),
    prioritySetByUserId: uuid('priority_set_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startDate: calendarDate('start_date').notNull(),
    dueDate: calendarDate('due_date').notNull(),
    startedAt: instant('started_at'),
    waitingSince: instant('waiting_since'),
    completedAt: instant('completed_at'),
    completedByUserId: uuid('completed_by_user_id').references(() => users.id),
    customerVisible: boolean('customer_visible').notNull().default(false),
    notifyCustomer: boolean('notify_customer').notNull().default(false),
    approval: boolean('approval').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    /** The template's reviewer when the task was made: approvers or project_manager. */
    reviewer: text('reviewer').notNull().default('approvers'),
    evidence: text('evidence').array().notNull(),
    captures: text('captures').array().notNull(),
    /** The template's checklist when the task was made; null uses the built-in list. */
    checklist: jsonb('checklist').$type<{ key: string; label: string }[]>(),
    onComplete: text('on_complete'),
    reports: text('reports').array().notNull(),
    note: text('note'),
    position: integer('position').notNull(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('project_tasks_project_idx').on(table.projectId),
    index('project_tasks_assignee_idx').on(table.assigneeUserId),
  ],
);

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependsOnTaskId] })],
);

/** Facts captured once by tasks and reused by reports and documents (PRD 3.18). */
export const projectFacts = pgTable(
  'project_facts',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    capturedByTaskId: uuid('captured_by_task_id').references(() => projectTasks.id, {
      onDelete: 'set null',
    }),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.key] })],
);

/** The project's history: what happened, who did it, and when. */
export const projectActivities = pgTable(
  'project_activities',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => projectTasks.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    data: jsonb('data'),
    createdAt: createdAt(),
  },
  (table) => [index('project_activities_project_idx').on(table.projectId)],
);
