import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseConnection, MIGRATIONS_FOLDER } from '@oneohm/database';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { acceptanceDb } from './db';

const NAME = 'oneohm_acceptance_migration';

/**
 * A throw-away database (`oneohm_acceptance_migration`, dropped after) migrated up to the
 * migration before `tag`; `seedOld` writes rows the way the old schema kept them; then the
 * rest is applied and `read` looks at the result. Never touches `oneohm_acceptance` or dev.
 */
export async function migrateOverOldRows<T>(
  tag: string,
  seedOld: (query: (text: string) => Promise<unknown>) => Promise<void>,
  read: (query: <R>(text: string) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  const server = acceptanceDb().pool;
  const url = new URL(process.env.ACCEPTANCE_DATABASE_URL ?? '');
  url.pathname = `/${NAME}`;
  await server.query(`DROP DATABASE IF EXISTS ${NAME}`);
  await server.query(`CREATE DATABASE ${NAME}`);
  const before = mkdtempSync(join(tmpdir(), 'oneohm-migrations-'));
  const scratch = createDatabaseConnection(url.toString(), { max: 1 });
  try {
    cpSync(MIGRATIONS_FOLDER, before, { recursive: true });
    const journalPath = join(before, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const upTo = journal.entries.findIndex((entry) => entry.tag === tag);
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, upTo) }),
    );
    await migrate(scratch.db, { migrationsFolder: before });
    // Foreign keys stay on: old rows are seeded with their parents, and checked again on the copy.
    await seedOld((text) => scratch.pool.query(text));
    await migrate(scratch.db, { migrationsFolder: MIGRATIONS_FOLDER });
    return await read(async <R>(text: string) => (await scratch.pool.query(text)).rows as R[]);
  } finally {
    await scratch.close();
    rmSync(before, { recursive: true, force: true });
    await server.query(`DROP DATABASE IF EXISTS ${NAME}`);
  }
}
