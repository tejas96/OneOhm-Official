import { rows } from './db';
import { upload } from './files';
import type { Session } from './http';
import { replies } from './onboarding';
import type { Sale } from './sales';

// Helpers for the journey scenarios (67-*, phase 4a).

/** Switches the customer messages of one task of the project on or off (its template setting). */
export async function setNotify(sale: Sale, key: string, on: boolean): Promise<string> {
  const [task] = await rows<{ id: string }>(
    `UPDATE project_tasks SET notify_customer = $3
      WHERE id = (SELECT id FROM project_tasks WHERE project_id = $1 AND template_key = $2 LIMIT 1)
      RETURNING id`,
    [sale.project.id, key, on],
  );
  if (!task) throw new Error(`The project has no ${key} task.`);
  return task.id;
}

/** A paper the customer may see, filed on the project (a staff upload). */
export function addPaper(admin: Session, sale: Sale, category: string, name: string) {
  return upload<{ id: string }>(admin, 'document', {
    projectId: sale.project.id,
    category,
    name,
  });
}

/** The customer's asks of one type, newest first. */
export const asksOf = (customerId: string, type: string) =>
  rows<{ id: string; status: string; payload: Record<string, unknown>; task_id: string | null }>(
    `SELECT id, status::text AS status, payload, task_id FROM customer_actions
      WHERE customer_id = $1 AND type = $2::customer_action_type ORDER BY created_at DESC`,
    [customerId, type],
  );

/** The chat messages this number got after the first `skip` ones. */
export async function repliesAfter(phone: string, skip: number) {
  return (await replies(phone)).slice(skip);
}

export const taskRow = async (id: string) =>
  (
    await rows<{ status: string; waiting_party: string; waiting_since: Date | null }>(
      'SELECT status::text AS status, waiting_party::text AS waiting_party, waiting_since FROM project_tasks WHERE id = $1',
      [id],
    )
  )[0];

// Helpers for the subsidy, loan and layout scenarios (68-*, phase 4b).

/** The id of the project's task of one kind. */
export async function taskIdOf(sale: Sale, key: string): Promise<string> {
  const [task] = await rows<{ id: string }>(
    'SELECT id FROM project_tasks WHERE project_id = $1 AND template_key = $2 LIMIT 1',
    [sale.project.id, key],
  );
  if (!task) throw new Error(`The project has no ${key} task.`);
  return task.id;
}

/** The task counts as done without walking the whole project (the offers and the asks only read its status). */
export const markDone = (taskId: string) =>
  rows("UPDATE project_tasks SET status = 'completed', completed_at = now() WHERE id = $1", [
    taskId,
  ]);

/** Switches one message template on or off (Settings → WhatsApp messages); returns how to put it back. */
export async function setTemplate(key: string, active: boolean): Promise<() => Promise<unknown>> {
  const [before] = await rows<{ active: boolean }>(
    'SELECT active FROM message_templates WHERE key = $1',
    [key],
  );
  await rows('UPDATE message_templates SET active = $2 WHERE key = $1', [key, active]);
  return () =>
    rows('UPDATE message_templates SET active = $2 WHERE key = $1', [key, before?.active ?? false]);
}

/** What the send menu offers for one action at this place. */
export async function offerOf(admin: Session, scope: Record<string, string>, action: string) {
  const { optionsOf } = await import('./send');
  return (await optionsOf(admin, scope)).offers.filter((offer) => offer.action === action);
}

/** The ask rows of one kind (`payload.kind`), newest first. */
export const stepAsks = (customerId: string, kind: string) =>
  rows<{ id: string; status: string; payload: Record<string, unknown>; task_id: string | null }>(
    `SELECT id, status::text AS status, payload, task_id FROM customer_actions
      WHERE customer_id = $1 AND type = 'confirm' AND payload->>'kind' = $2 ORDER BY created_at DESC`,
    [customerId, kind],
  );

/** A project's log lines that contain this text. */
export const logLines = (projectId: string, like: string) =>
  rows<{ message: string; task_id: string | null }>(
    'SELECT message, task_id FROM project_activities WHERE project_id = $1 AND message LIKE $2',
    [projectId, like],
  );

/** A fixed working-day noon in business time (Wednesday), as the reminder tests use. */
export const NOON = new Date('2026-11-04T06:30:00Z');

/** Saves the project's loan the way the loan desk does (the version it last saw); `over` changes any field. */
export async function saveLoan(
  admin: Session,
  sale: Sale,
  over: Record<string, unknown> = {},
): Promise<void> {
  const loans = await admin.get<{ projectId: string; version: number | null }[]>('/finance/loans');
  const loan = loans.find((one) => one.projectId === sale.project.id);
  await admin.put(`/finance/loans/${sale.project.id}`, {
    version: loan?.version ?? null,
    lenderName: 'HDFC Bank (test)',
    status: 'collecting_documents',
    documents: [],
    tranches: [],
    ...over,
  });
}
