import type { WorkforcePolicy } from '@oneohm/domain';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, primaryId, updatedAt } from './columns';
import { users } from './identity.schema';

export const decisionStatusEnum = pgEnum('decision_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

/** Leave, attendance and points rules (PRD 7.2). One row, edited in Settings. */
export const workforcePolicy = pgTable('workforce_policy', {
  id: text('id').primaryKey().default('default'),
  policy: jsonb('policy').$type<WorkforcePolicy>().notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

/** Places where checking in counts as being at work: the office, the store (PRD 4.3). */
export const workLocations = pgTable('work_locations', {
  id: primaryId(),
  name: text('name').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  radiusM: integer('radius_m').notNull().default(150),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/** Consent to share location at check-in and check-out; withdrawing stops it at once. */
export const locationConsents = pgTable('location_consents', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  consentedAt: instant('consented_at'),
  withdrawnAt: instant('withdrawn_at'),
  /** Which version of the consent words the person agreed to (PRD 4.3). */
  textVersion: integer('text_version'),
});

/**
 * One working day per person: check-in and check-out times, and where they were when
 * they consented to share it. Coordinates are cleared after the retention period.
 */
export const attendanceDays = pgTable(
  'attendance_days',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: calendarDate('work_date').notNull(),
    checkInAt: instant('check_in_at').notNull(),
    checkInLatitude: doublePrecision('check_in_latitude'),
    checkInLongitude: doublePrecision('check_in_longitude'),
    checkInAccuracyM: integer('check_in_accuracy_m'),
    checkInLocationId: uuid('check_in_location_id').references(() => workLocations.id, {
      onDelete: 'set null',
    }),
    checkInDistanceM: integer('check_in_distance_m'),
    checkInInside: boolean('check_in_inside'),
    late: boolean('late').notNull().default(false),
    checkOutAt: instant('check_out_at'),
    checkOutLatitude: doublePrecision('check_out_latitude'),
    checkOutLongitude: doublePrecision('check_out_longitude'),
    checkOutAccuracyM: integer('check_out_accuracy_m'),
    checkOutInside: boolean('check_out_inside'),
    /** Set when an approved correction changed the times. */
    correctedAt: instant('corrected_at'),
    locationClearedAt: instant('location_cleared_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('attendance_days_user_date_unique').on(table.userId, table.workDate),
    index('attendance_days_date_idx').on(table.workDate),
  ],
);

/** "I forgot to check out", with the times the person says are right (PRD 4.3). */
export const attendanceCorrections = pgTable(
  'attendance_corrections',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: calendarDate('work_date').notNull(),
    checkInAt: instant('check_in_at'),
    checkOutAt: instant('check_out_at'),
    reason: text('reason').notNull(),
    status: decisionStatusEnum('status').notNull().default('pending'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: instant('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (table) => [index('attendance_corrections_status_idx').on(table.status)],
);

/** Leave applications with the handover they come with (PRD 4.6, Flow E). */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    leaveType: text('leave_type').notNull(),
    fromDate: calendarDate('from_date').notNull(),
    toDate: calendarDate('to_date').notNull(),
    halfDay: boolean('half_day').notNull().default(false),
    /** Working days in halves, so a half day stays exact. */
    halfDays: integer('half_days').notNull(),
    reason: text('reason'),
    emergency: boolean('emergency').notNull().default(false),
    backupUserId: uuid('backup_user_id').references(() => users.id, { onDelete: 'set null' }),
    handoverNote: text('handover_note'),
    status: decisionStatusEnum('status').notNull().default('pending'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: instant('decided_at'),
    decisionNote: text('decision_note'),
    /** Open tasks handed to the backup when the leave was approved. */
    tasksHandedOver: integer('tasks_handed_over').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('leave_requests_user_idx').on(table.userId),
    index('leave_requests_status_idx').on(table.status),
  ],
);

/**
 * Points and recognition (PRD 4.7, Flow G). Automatic entries name their source so each
 * is given once; suggestions wait for a manager.
 */
export const pointsEntries = pgTable(
  'points_entries',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    points: integer('points').notNull(),
    reason: text('reason').notNull(),
    sourceType: text('source_type', {
      enum: ['task_on_time', 'customer_rating', 'recognition'],
    }).notNull(),
    sourceId: text('source_id').notNull(),
    status: decisionStatusEnum('status').notNull().default('approved'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: instant('decided_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('points_entries_source_unique').on(table.sourceType, table.sourceId, table.userId),
    index('points_entries_user_idx').on(table.userId),
  ],
);
