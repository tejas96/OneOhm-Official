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
