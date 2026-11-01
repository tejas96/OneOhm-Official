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
import { payables } from './finance.schema';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';
import { documents } from './records.schema';
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
    locationClearedAt: instant('location_cleared_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('site_visits_user_date_idx').on(table.userId, table.workDate),
    index('site_visits_task_idx').on(table.taskId),
    index('site_visits_project_idx').on(table.projectId),
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
    note: text('note'),
    status: decisionStatusEnum('status').notNull().default('pending'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: instant('decided_at'),
    decisionNote: text('decision_note'),
    payableId: uuid('payable_id').references(() => payables.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('travel_claims_status_idx').on(table.status),
    // One live claim per person per day; a declined or cancelled one can be made again.
    uniqueIndex('travel_claims_day_unique')
      .on(table.userId, table.workDate)
      .where(sql`${table.status} in ('pending', 'approved')`),
  ],
);
