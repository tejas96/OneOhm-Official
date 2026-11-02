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

/**
 * Makes a task look untouched for `days` (acceptance database only): moves its own
 * update time and its history lines and files back by that many days.
 */
export async function ageTask(taskId: string, days: number): Promise<void> {
  const shift = `${days} days`;
  await rows('UPDATE project_tasks SET updated_at = updated_at - $2::interval WHERE id = $1', [
    taskId,
    shift,
  ]);
  await rows(
    'UPDATE project_activities SET created_at = created_at - $2::interval WHERE task_id = $1',
    [taskId, shift],
  );
  await rows('UPDATE documents SET created_at = created_at - $2::interval WHERE task_id = $1', [
    taskId,
    shift,
  ]);
}

/** Sets a task's dates directly (acceptance database only). */
export async function setTaskDates(
  taskId: string,
  dates: { readonly dueDate?: string; readonly startDate?: string },
): Promise<void> {
  if (dates.startDate)
    await rows('UPDATE project_tasks SET start_date = $2 WHERE id = $1', [taskId, dates.startDate]);
  if (dates.dueDate)
    await rows('UPDATE project_tasks SET due_date = $2 WHERE id = $1', [taskId, dates.dueDate]);
}

/** Records a finished wait on a party for whole days `from`..`to` (acceptance only). */
export async function addTaskWait(
  taskId: string,
  party: 'customer' | 'bank' | 'discom' | 'internal',
  from: string,
  to: string,
): Promise<void> {
  await rows(
    `INSERT INTO task_waits (task_id, party, started_at, ended_at)
     VALUES ($1, $2, $3::date::timestamp AT TIME ZONE 'Asia/Kolkata',
             ($4::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`,
    [taskId, party, from, to],
  );
}

/** Moves a task's hand-ins back by `days` (acceptance database only). */
export async function ageHandIns(taskId: string, days: number): Promise<void> {
  await rows('UPDATE task_reviews SET created_at = created_at - $2::interval WHERE task_id = $1', [
    taskId,
    `${days} days`,
  ]);
}

/** Moves a person's points rows into the middle of a past month (acceptance only). */
export async function movePointsToMonth(userId: string, month: string): Promise<void> {
  await rows(
    `UPDATE points_entries SET created_at = ($2::date + time '12:00') AT TIME ZONE 'Asia/Kolkata'
     WHERE user_id = $1`,
    [userId, `${month}-15`],
  );
}

/** Moves the start of a task's current wait back by `days` (acceptance only). */
export async function ageWait(taskId: string, days: number): Promise<void> {
  await rows(
    'UPDATE project_tasks SET waiting_since = waiting_since - $2::interval WHERE id = $1',
    [taskId, `${days} days`],
  );
}

/** Moves the start of the fair points rules (acceptance only). */
export async function setFairPointsSince(date: string): Promise<void> {
  await rows(
    `INSERT INTO points_rules (key, since) VALUES ('fair_points', $1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     ON CONFLICT (key) DO UPDATE SET since = EXCLUDED.since`,
    [date],
  );
}

/** Adds approved leave for a person (acceptance only). */
export async function addLeave(
  userId: string,
  from: string,
  to: string,
  halfDay = false,
): Promise<void> {
  await rows(
    `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_day, half_days, status)
     VALUES ($1, 'casual', $2, $3, $4, $5, 'approved')`,
    [userId, from, to, halfDay, halfDay ? 1 : 2],
  );
}
