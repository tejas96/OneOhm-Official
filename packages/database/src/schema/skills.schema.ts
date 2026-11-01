import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns';
import { users } from './identity.schema';

/**
 * Skills the business tracks, such as a wiring licence or working at height (PRD 3.7,
 * 7.4). Owners add and rename them in Settings; task templates can ask for one.
 */
export const skills = pgTable('skills', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  active: boolean('active').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Which skills each person holds. */
export const userSkills = pgTable(
  'user_skills',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillKey: text('skill_key')
      .notNull()
      .references(() => skills.key, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.skillKey] })],
);
