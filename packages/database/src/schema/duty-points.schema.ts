import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { instant } from './columns';
import { users } from './identity.schema';
import { attendanceDays } from './workforce.schema';

/**
 * The route a phone records while its person is on duty (Duty Day step 1): one row per
 * point, between check-in and check-out of an attendance day, with consent. The id is the
 * one the phone made, so a batch sent twice is stored once. The step-2 km and the later
 * stops and live map read these rows. Deleted after the retention period in Settings;
 * the saved travel day keeps the numbers worked out from them.
 */
export const dutyPoints = pgTable(
  'duty_points',
  {
    /** Made on the phone; unique per person, not across people. */
    id: uuid('id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attendanceDayId: uuid('attendance_day_id')
      .notNull()
      .references(() => attendanceDays.id, { onDelete: 'cascade' }),
    /** When the phone took the reading, not when it reached the server. */
    recordedAt: instant('recorded_at').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    accuracyM: doublePrecision('accuracy_m'),
    speedMps: doublePrecision('speed_mps'),
    headingDeg: doublePrecision('heading_deg'),
    altitudeM: doublePrecision('altitude_m'),
    /** The phone says the reading came from a mock-location app (Android). */
    mocked: boolean('mocked').notNull().default(false),
    batteryPercent: integer('battery_percent'),
    charging: boolean('charging'),
    network: text('network'),
    receivedAt: instant('received_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'duty_points_user_id_pk', columns: [table.userId, table.id] }),
    index('duty_points_user_recorded_idx').on(table.userId, table.recordedAt),
    index('duty_points_day_idx').on(table.attendanceDayId),
  ],
);
