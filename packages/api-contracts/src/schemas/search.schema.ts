import { z } from 'zod';
import { idSchema } from '../common/primitives';

/** What universal search finds, in the order the results show (PRD 10: universal search). */
export const SEARCH_TYPES = [
  'projects',
  'customers',
  'leads',
  'quotations',
  'tasks',
  'payments',
  'service',
  'documents',
  'contractors',
  'vendors',
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

const isSearchType = (value: string): value is SearchType =>
  (SEARCH_TYPES as readonly string[]).includes(value);

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 letters.').max(80),
  /** Comma-separated types to search (e.g. `projects,tasks`); all the person may see when left out. */
  types: z
    .string()
    .max(200)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((part) => part.trim())
            .filter(isSearchType)
        : [...SEARCH_TYPES],
    ),
  /** Results per type. */
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

/**
 * One found record. The text is data (names, codes, phone numbers, places); each app
 * words the type and the state in its own language and builds its own link.
 */
export const searchHitSchema = z.object({
  type: z.enum(SEARCH_TYPES),
  id: idSchema,
  /** A name, number or title. */
  title: z.string(),
  /** Short facts for the second line: a code, a customer, a place, a phone. */
  facts: z.array(z.string()),
  /** The record's own state value: a lead stage, a quotation, task or request status; else null. */
  state: z.string().nullable(),
  /**
   * The record this one is kept on, where it opens: the project of a task, payment or
   * file; the customer, lead, vendor or contractor of a file. Null when it opens itself.
   */
  parent: z
    .object({
      type: z.enum(['projects', 'customers', 'leads', 'vendors', 'contractors']),
      id: idSchema,
    })
    .nullable(),
  /** A payment's amount, or a quotation's effective price. */
  amountPaise: z.number().int().nullable(),
  /** A number to call, as +91…; null when none or not the person's to see. */
  phone: z.string().nullable(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResultSchema = z.object({
  /** Hits grouped by type in `SEARCH_TYPES` order, best match first within a type. */
  hits: z.array(searchHitSchema),
  /** The types this person may search (the rest were left out, not empty). */
  searched: z.array(z.enum(SEARCH_TYPES)),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
