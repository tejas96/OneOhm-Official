import { boolean, pgTable, text } from 'drizzle-orm/pg-core';
import { updatedAt } from './columns';

/**
 * WhatsApp templates as approved in Meta's WhatsApp Manager (PRD 7.2). `key` is what
 * OneOhm asks to send; `metaName` and `language` name the approved template, and
 * `fields` fill its {{1}}, {{2}}… in order. `preview` is the approved wording.
 */
export const messageTemplates = pgTable('message_templates', {
  key: text('key').primaryKey(),
  audience: text('audience').notNull(),
  metaName: text('meta_name').notNull(),
  language: text('language').notNull().default('en'),
  /** The same message approved in Marathi and Hindi (language codes mr, hi); null sends English. */
  metaNameMr: text('meta_name_mr'),
  metaNameHi: text('meta_name_hi'),
  fields: text('fields').array().notNull(),
  preview: text('preview').notNull(),
  active: boolean('active').notNull().default(true),
  updatedAt: updatedAt(),
});
