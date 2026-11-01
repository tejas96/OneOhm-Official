import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from './columns';
import { serviceRequests } from './customer-portal.schema';
import { users } from './identity.schema';
import { siteVisits } from './site-activity.schema';

/**
 * What the technician wrote when finishing a service request from the field app
 * (PRD 5.5): what they found and did, and whether the work is done or handed back to
 * the desk with a reason. A request can have several, one per hand-back or finish.
 */
export const serviceVisitReports = pgTable(
  'service_visit_reports',
  {
    id: primaryId(),
    serviceRequestId: uuid('service_request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'cascade' }),
    /** The visit the person was checked in on when they finished, if any. */
    siteVisitId: uuid('site_visit_id').references(() => siteVisits.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    outcome: text('outcome', { enum: ['done', 'handed_back'] }).notNull(),
    found: text('found'),
    workDone: text('work_done'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (table) => [index('service_visit_reports_request_idx').on(table.serviceRequestId)],
);
