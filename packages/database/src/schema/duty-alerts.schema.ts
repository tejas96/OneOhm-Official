import { DUTY_ALERT_KINDS, DUTY_ALERT_SEVERITIES, DUTY_ALERT_SUBJECTS } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, primaryId } from './columns';
import { users } from './identity.schema';

/**
 * What an alert says beyond its title, for the alert feed: plain labels and numbers only.
 * Never coordinates (alerts are kept past the route's retention period until cleared).
 */
export type DutyAlertDetail = Readonly<Record<string, string | number | boolean | null>>;

/**
 * One alert of a duty day ("Nothing goes silent", Duty Day step 5): a person's missed
 * check-in, fake GPS, route gap, unknown stop, a long or missed or doubtful site visit, a job
 * left unfinished, a travel claim waiting or unpaid. Each kind fires once per subject and day
 * (the unique key); the named people are told once. Deleted after the retention period.
 */
export const dutyAlerts = pgTable(
  'duty_alerts',
  {
    id: primaryId(),
    kind: text('kind', { enum: DUTY_ALERT_KINDS }).notNull(),
    /** The person the alert is about; their manager (else HR) is told. */
    personId: uuid('person_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type', { enum: DUTY_ALERT_SUBJECTS }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    /** The business day it is about (the duty day, the planned visit's day, the claim's day). */
    day: calendarDate('day').notNull(),
    title: text('title').notNull(),
    detail: jsonb('detail').$type<DutyAlertDetail>().notNull().default({}),
    severity: text('severity', { enum: DUTY_ALERT_SEVERITIES }).notNull(),
    createdAt: createdAt(),
    seenAt: instant('seen_at'),
    seenBy: uuid('seen_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: instant('resolved_at'),
    /** Null while open or when the system resolved it (`resolved_reason` says why). */
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedReason: text('resolved_reason'),
  },
  (table) => [
    uniqueIndex('duty_alerts_once').on(table.kind, table.subjectType, table.subjectId, table.day),
    index('duty_alerts_open_idx')
      .on(table.personId, table.createdAt)
      .where(sql`${table.resolvedAt} is null`),
    index('duty_alerts_day_idx').on(table.day),
  ],
);
