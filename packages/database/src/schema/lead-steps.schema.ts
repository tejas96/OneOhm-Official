import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns';
import { leadStageEnum } from './enums';

/**
 * The owner's sales pipeline (PRD 3.3): named steps, each inside one of the fixed open
 * lead stages the system's automation uses. Edited in Settings → Lead stages.
 */
export const leadSteps = pgTable('lead_steps', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  stage: leadStageEnum('stage').notNull(),
  position: integer('position').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
