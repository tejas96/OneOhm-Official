import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns';

/**
 * The papers a project needs (PRD 3.14), as the owner set them up: which folder counts,
 * why it is needed, and the rule for when it applies (project type, loan, subsidy,
 * name change, DISCOM). OneOhm's own list is seeded once and can be edited.
 */
export const documentRequirements = pgTable('document_requirements', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  why: text('why').notNull().default(''),
  categories: text('categories').array().notNull(),
  fromCustomer: boolean('from_customer').notNull().default(false),
  conditions: jsonb('conditions')
    .$type<{
      types?: readonly string[] | undefined;
      loan?: boolean | undefined;
      subsidy?: boolean | undefined;
      nameChange?: boolean | undefined;
      discomCodes?: readonly string[] | undefined;
    }>()
    .notNull()
    .default({}),
  active: boolean('active').notNull().default(true),
  position: integer('position').notNull().default(0),
  builtIn: boolean('built_in').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
