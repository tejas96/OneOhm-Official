import { CUSTODY_KINDS } from '@oneohm/domain';
import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products } from './catalog.schema';
import { calendarDate, createdAt, primaryId } from './columns';
import { contractors } from './contractors.schema';
import { users } from './identity.schema';
import { stockLocations } from './inventory.schema';
import { dispatches } from './procurement.schema';
import { projects, projectTasks } from './projects.schema';
import { documents } from './records.schema';

export const materialSlipKindEnum = pgEnum('material_slip_kind', CUSTODY_KINDS);

/**
 * Material in a contractor's hands for a project (PRD 3.10, 3.13): an issue slip when it
 * leaves the store (or a delivery challan handed to the crew), a usage slip when it goes
 * into the system, a return slip when what is left comes back. Never edited.
 */
export const materialSlips = pgTable(
  'material_slips',
  {
    id: primaryId(),
    /** MI/2026/0001 (issue), MU/… (use), MR/… (return). */
    number: text('number').notNull(),
    kind: materialSlipKindEnum('kind').notNull(),
    contractorId: uuid('contractor_id')
      .notNull()
      .references(() => contractors.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    /** The store it left or came back to; none for usage. */
    locationId: uuid('location_id').references(() => stockLocations.id),
    /** Set when the material reached the crew on a delivery challan. */
    dispatchId: uuid('dispatch_id').references(() => dispatches.id),
    /** Usage recorded when finishing a task. */
    taskId: uuid('task_id').references(() => projectTasks.id, { onDelete: 'set null' }),
    occurredOn: calendarDate('occurred_on').notNull(),
    note: text('note'),
    photoDocumentId: uuid('photo_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('material_slips_number_unique').on(table.number),
    index('material_slips_contractor_idx').on(table.contractorId),
    index('material_slips_project_idx').on(table.projectId),
  ],
);

export const materialSlipLines = pgTable(
  'material_slip_lines',
  {
    id: primaryId(),
    slipId: uuid('slip_id')
      .notNull()
      .references(() => materialSlips.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    /** The quotation line it serves (panel, dc_cable, structure…); null for extras. */
    lineKey: text('line_key'),
    quantity: doublePrecision('quantity').notNull(),
    /** Serialised items: the units on this slip. */
    serials: text('serials').array().notNull().default([]),
  },
  (table) => [
    index('material_slip_lines_slip_idx').on(table.slipId),
    index('material_slip_lines_product_idx').on(table.productId),
  ],
);
