import { sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from './client';

/**
 * The next number in a series such as OH-Q-2026-0017: the highest number used so far plus
 * one, never the row count, so a deleted row cannot make the next number repeat an old one.
 * Serialised with a lock on `lockKey`; call it inside the transaction that inserts the row.
 */
export async function nextInSeries(
  db: DatabaseExecutor,
  options: {
    readonly column: PgColumn;
    readonly prefix: string;
    readonly width: number;
    readonly lockKey: string;
  },
): Promise<string> {
  const { column, prefix, width, lockKey } = options;
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`oneohm:${lockKey}`}))`);
  const digits = sql`regexp_replace(substr(${column}, ${prefix.length + 1}), '[^0-9]', '', 'g')`;
  const result = await db.execute<{ last: number | null }>(
    sql`select max(nullif(${digits}, '')::int) as last
        from ${column.table} where ${column} like ${`${prefix}%`}`,
  );
  return seriesNumber(prefix, result.rows[0]?.last ?? 0, width);
}

/** `prefix` + (last + 1), zero-padded to `width` digits. */
export const seriesNumber = (prefix: string, last: number, width: number): string =>
  `${prefix}${String(Number(last) + 1).padStart(width, '0')}`;
