import type {
  ChangeRequestBlocks,
  ChangeRequestFieldChoice,
  ChangeRequestStep,
  ChangeRequestUpdateKey,
  DocumentCategory,
} from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { discoms } from './catalog.schema';
import { createdAt, primaryId, updatedAt } from './columns';
import { users } from './identity.schema';

/**
 * A DISCOM's utility change requests (PRD 3.15): what each asks for, the papers it
 * needs, its steps, the project work it holds and the site details it updates. Every
 * DISCOM starts with OneOhm's six; the owner changes them in Settings → DISCOMs.
 */
export const changeRequestTypes = pgTable(
  'change_request_types',
  {
    id: primaryId(),
    discomId: uuid('discom_id')
      .notNull()
      .references(() => discoms.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    fields: jsonb('fields').$type<ChangeRequestFieldChoice[]>().notNull(),
    documents: text('documents')
      .array()
      .$type<DocumentCategory[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    steps: jsonb('steps').$type<ChangeRequestStep[]>().notNull(),
    blocks: jsonb('blocks').$type<ChangeRequestBlocks>().notNull(),
    updates: text('updates')
      .array()
      .$type<ChangeRequestUpdateKey[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    active: boolean('active').notNull().default(true),
    position: integer('position').notNull().default(0),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('change_request_types_discom_key').on(table.discomId, table.key)],
);

/**
 * A DISCOM's statutory report formats (PRD 3.18 "report templates are linked per DISCOM"):
 * the Handlebars body that prints, and when it applies. `source` says whether it is still
 * OneOhm's own file (kept up to date) or one the owner uploaded (never touched).
 */
export const discomReportTemplates = pgTable(
  'discom_report_templates',
  {
    id: primaryId(),
    discomId: uuid('discom_id')
      .notNull()
      .references(() => discoms.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    body: text('body').notNull(),
    /** "Not needed" on projects without the subsidy (the DCR undertaking). */
    onlyWithSubsidy: boolean('only_with_subsidy').notNull().default(false),
    customerVisible: boolean('customer_visible').notNull().default(true),
    active: boolean('active').notNull().default(true),
    source: text('source').$type<'built_in' | 'uploaded'>().notNull().default('built_in'),
    position: integer('position').notNull().default(0),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('discom_report_templates_discom_key').on(table.discomId, table.key)],
);
