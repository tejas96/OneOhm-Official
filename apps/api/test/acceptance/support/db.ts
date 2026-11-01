import { createDatabaseConnection, type DatabaseConnection } from '@oneohm/database';

/**
 * Read access to `oneohm_acceptance` for outcomes the API does not show directly (the
 * WhatsApp outbox). Refuses any other database, so a scenario can never read or change
 * the dev data.
 */
const URL_TEXT = process.env.ACCEPTANCE_DATABASE_URL ?? '';
let connection: DatabaseConnection | null = null;

export function acceptanceDb(): DatabaseConnection {
  const name = URL_TEXT ? new URL(URL_TEXT).pathname.replace(/^\//, '') : '';
  if (name !== 'oneohm_acceptance') {
    throw new Error(
      'ACCEPTANCE_DATABASE_URL must point at oneohm_acceptance (the runner sets it).',
    );
  }
  connection ??= createDatabaseConnection(URL_TEXT, { max: 2 });
  return connection;
}

export async function closeDb(): Promise<void> {
  await connection?.close();
  connection = null;
}

/** Runs a read query with $1… parameters and returns the rows. */
export async function rows<T>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await acceptanceDb().pool.query(text, values);
  return result.rows as T[];
}

export interface OutboxRow {
  id: string;
  channel: string;
  recipient: string;
  template: string;
  payload: Record<string, string>;
  dedupe_key: string;
  status: string;
}

/** Messages queued for one customer phone, oldest first. */
export function outboxFor(phone: string): Promise<OutboxRow[]> {
  return rows<OutboxRow>(
    'select id, channel, recipient, template, payload, dedupe_key, status from outbox where recipient = $1 order by created_at',
    [phone],
  );
}
