import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { properties } from './crm.schema';
import { serviceRequests } from './customer-portal.schema';
import { payables } from './finance.schema';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';
import { documents } from './records.schema';
import { visits } from './visits.schema';
import { decisionStatusEnum } from './workforce.schema';

/**
 * Checking in and out at a customer's site for a survey, installation, inspection or
 * service visit (PRD 4.2, 4.3). Coordinates are kept only with consent, during working
 * hours, and cleared after the retention period; distances and flags stay.
 */
export const siteVisits = pgTable(
  'site_visits',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => projectTasks.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    /** A service visit's request (PRD 5.5); a visit is for a task or a request. */
    serviceRequestId: uuid('service_request_id').references(() => serviceRequests.id, {
      onDelete: 'set null',
    }),
    /** The planned visit (a day's booking for this task or request) this check-in is for. */
    visitId: uuid('visit_id').references(() => visits.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['survey', 'installation', 'inspection', 'service'] }).notNull(),
    /** India date of the check-in: the day whose travel this visit is part of. */
    workDate: calendarDate('work_date').notNull(),
    checkInAt: instant('check_in_at').notNull(),
    checkInLatitude: doublePrecision('check_in_latitude'),
    checkInLongitude: doublePrecision('check_in_longitude'),
    checkInAccuracyM: integer('check_in_accuracy_m'),
    /** From the site's saved location; null when either is unknown. */
    checkInDistanceM: integer('check_in_distance_m'),
    checkInFar: boolean('check_in_far'),
    checkOutAt: instant('check_out_at'),
    checkOutLatitude: doublePrecision('check_out_latitude'),
    checkOutLongitude: doublePrecision('check_out_longitude'),
    checkOutAccuracyM: integer('check_out_accuracy_m'),
    checkOutDistanceM: integer('check_out_distance_m'),
    checkOutFar: boolean('check_out_far'),
    /** Who ended the visit when it was not the person's own check-out (live review S1). */
    closedByUserId: uuid('closed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** How it ended: the person, a manager's force-close, or the end of the person's day. */
    closeKind: text('close_kind', { enum: ['self', 'manager', 'day_end'] }),
    closeNote: text('close_note'),
    /** How the check-in happened: a tap, the phone's site fence, or the recorded route (Duty Day step 3). */
    checkInSource: text('check_in_source', { enum: ['manual', 'auto_fence', 'auto_route'] })
      .notNull()
      .default('manual'),
    /** How the check-out happened; null while open. */
    checkOutSource: text('check_out_source', {
      enum: ['manual', 'auto_fence', 'auto_route', 'task_complete', 'day_end', 'force_close'],
    }),
    /** Why the person left before the job was done, from the phone's "Why?" question. */
    leaveReason: text('leave_reason', {
      enum: ['come_back_later', 'need_material', 'customer_not_home'],
    }),
    leaveReasonAt: instant('leave_reason_at'),
    /** The check-in was an automatic one that reached the server late (the phone waited for signal). */
    delayed: boolean('delayed').notNull().default(false),
    locationClearedAt: instant('location_cleared_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('site_visits_user_date_idx').on(table.userId, table.workDate),
    index('site_visits_task_idx').on(table.taskId),
    index('site_visits_project_idx').on(table.projectId),
    index('site_visits_service_request_idx').on(table.serviceRequestId),
    index('site_visits_visit_idx').on(table.visitId),
    // One open visit per person: check out of one site before checking in at the next.
    uniqueIndex('site_visits_open_unique').on(table.userId).where(sql`${table.checkOutAt} is null`),
  ],
);

/**
 * Where and when an evidence photo was taken: from the photo's own EXIF or the phone's
 * location at capture, kept with consent only (PRD 4.2). One row per document.
 */
export const documentGeotags = pgTable('document_geotags', {
  documentId: uuid('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  capturedAt: instant('captured_at'),
  source: text('source', { enum: ['exif', 'device'] }).notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  accuracyM: integer('accuracy_m'),
  distanceM: integer('distance_m'),
  farFromSite: boolean('far_from_site'),
  locationClearedAt: instant('location_cleared_at'),
  createdAt: createdAt(),
});

/** One stop-to-stop leg of a claimed day, as it was when the claim was made. */
export interface TravelClaimLeg {
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly distanceM: number | null;
}

/**
 * A day's travel between sites, claimed at the rate in Settings (PRD 4.3). A manager or
 * HR decides it like leave; approval makes a payable to the employee in finance.
 */
export const travelClaims = pgTable(
  'travel_claims',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: calendarDate('work_date').notNull(),
    distanceM: integer('distance_m').notNull(),
    ratePaisePerKm: integer('rate_paise_per_km').notNull(),
    amountPaise: money('amount_paise').notNull(),
    legs: jsonb('legs').$type<TravelClaimLeg[]>().notNull(),
    visits: integer('visits').notNull(),
    /** The project the travel was for, so it counts in that project's actual cost. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    note: text('note'),
    /** Made by the system when the day closed, not by the person (Duty Day step 2). */
    autoMade: boolean('auto_made').notNull().default(false),
    /** Approved by the system at once: a clean day. Never set on a person's decision. */
    autoApproved: boolean('auto_approved').notNull().default(false),
    /** Why an automatic claim waits for a person: codes like route_gap, fake_gps. */
    reviewReasons: jsonb('review_reasons').$type<string[]>(),
    /**
     * Set when the person reopened the day (Resume duty) and the system took back its waiting
     * claim: the claim is then `cancelled` and the next close makes a fresh one.
     */
    withdrawnByResumeAt: instant('withdrawn_by_resume_at'),
    status: decisionStatusEnum('status').notNull().default('pending'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: instant('decided_at'),
    decisionNote: text('decision_note'),
    payableId: uuid('payable_id').references(() => payables.id, { onDelete: 'set null' }),
    /** Set when finance or an approver voided it after approval (status becomes cancelled). */
    voidedAt: instant('voided_at'),
    voidedByUserId: uuid('voided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('travel_claims_status_idx').on(table.status),
    index('travel_claims_project_idx').on(table.projectId),
    // One live claim per person per day; a declined or cancelled one can be made again.
    uniqueIndex('travel_claims_day_unique')
      .on(table.userId, table.workDate)
      .where(sql`${table.status} in ('pending', 'approved')`),
  ],
);

/**
 * A person's travel for one day, saved when the day closes (live review S3, S4): the
 * distance, the legs, the km rate in force that day and the visit count. Claims and the
 * travel screen read this, so neither today's rate nor cleared coordinates change what a
 * finished day is worth. Made again when the day is closed again or a correction moves it.
 */
export const travelDays = pgTable(
  'travel_days',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: calendarDate('work_date').notNull(),
    distanceM: integer('distance_m').notNull(),
    ratePaisePerKm: integer('rate_paise_per_km').notNull(),
    legs: jsonb('legs').$type<TravelClaimLeg[]>().notNull(),
    visits: integer('visits').notNull(),
    /** Metres along the recorded route, bad points removed; 0 when there was no route. */
    routeM: integer('route_m').notNull().default(0),
    /** Metres of the straight lines between the day's stops. */
    straightM: integer('straight_m').notNull().default(0),
    /** What is paid (also saved in `distance_m`, which claims read): route within the cap, or straight. */
    paidM: integer('paid_m').notNull().default(0),
    /** `route` when the paid km came from the recorded route, else `straight`. */
    method: text('method', { enum: ['route', 'straight'] })
      .notNull()
      .default('straight'),
    capApplied: boolean('cap_applied').notNull().default(false),
    gapCount: integer('gap_count').notNull().default(0),
    gapMinutes: integer('gap_minutes').notNull().default(0),
    mockedCount: integer('mocked_count').notNull().default(0),
    pointsCount: integer('points_count').notNull().default(0),
    computedAt: instant('computed_at').notNull(),
    /** `close` when saved as the day closed; `backfill` when made later for a day closed before. */
    source: text('source').notNull().default('close'),
  },
  (table) => [uniqueIndex('travel_days_user_date_unique').on(table.userId, table.workDate)],
);
