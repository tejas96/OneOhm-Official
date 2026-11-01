import { z } from 'zod';

/** Rows a list screen asks for at a time, and the most it may ask for. */
export const PAGE_SIZE = 30;
export const PAGE_SIZE_MAX = 100;

/**
 * A page of a long list (PRD 9.3: routine navigation stays instant). `cursor` is the
 * opaque `nextCursor` of the page before; leave it out for the first page.
 */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE),
  cursor: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/, 'Use the cursor the last page gave.')
    .optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/** One page: the rows, how many match in all, and the cursor for the next page (null at the end). */
export function pageOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
  });
}

export interface Page<T> {
  readonly items: T[];
  readonly total: number;
  readonly nextCursor: string | null;
}
