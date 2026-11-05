import type { Visit, VisitsOf } from '@oneohm/api-contracts';
import { rows } from './db';
import type { Session } from './http';
import { lastReply, replies, type SentReply, tap } from './onboarding';
import type { Sale } from './sales';
import { openChat } from './send';

// Helpers for the visit scenarios (66-*, phase 3b).

/** A task of the project by template key, with customer messages switched on for it. */
export async function visitTask(sale: Sale, key: string, assignee: string | null = null) {
  const [task] = await rows<{ id: string }>(
    `UPDATE project_tasks SET notify_customer = true, assignee_user_id = $3
      WHERE id = (SELECT id FROM project_tasks WHERE project_id = $1 AND template_key = $2 LIMIT 1)
      RETURNING id`,
    [sale.project.id, key, assignee],
  );
  if (!task) throw new Error(`The project has no ${key} task.`);
  return task.id;
}

export const visitsFor = (customerId: string) =>
  rows<{
    id: string;
    kind: string;
    status: string;
    day: string;
    slot: string;
    proposed_by: string;
    task_id: string | null;
    customer_confirmed_at: Date | null;
    customer_cannot_at: Date | null;
    reminder_sent_at: Date | null;
    crew_user_ids: string[];
  }>('SELECT *, day::text AS day FROM visits WHERE customer_id = $1 ORDER BY created_at', [
    customerId,
  ]);

export const visitsOf = (admin: Session, scope: Record<string, string>) =>
  admin.get<VisitsOf>(`/visits?${new URLSearchParams(scope).toString()}`);

export const setVisit = (admin: Session, body: Record<string, string>) =>
  admin.post<Visit>('/visits', body);

/** The customer's chat is open and the team asks for a day; returns the list the customer got. */
export async function askDay(admin: Session, sale: Sale, scope: Record<string, string>) {
  await openChat(sale.customer.phone, sale.customer.customerId);
  const sent = await admin.post<{ via: string; actionId: string }>('/send-to-customer', {
    scope,
    request: { action: 'ask_visit', ...scope },
  });
  const list = await lastReply(sale.customer.phone);
  return { sent, list };
}

/** Picks the first day on the list and a slot, as the customer. */
export async function pickDay(phone: string, list: SentReply | undefined, slot = 'morning') {
  const row = list?.rows?.find((one) => one.id.startsWith('vday:'));
  if (!row) throw new Error('No day on the list.');
  await tap(phone, row.id);
  const buttons = await lastReply(phone);
  // The slot asked for, else the one the crew still has free that day.
  const button =
    buttons?.buttons?.find((one) => one.id.endsWith(`:${slot}`)) ?? buttons?.buttons?.[0];
  if (!button) throw new Error('No slot button.');
  await tap(phone, button.id);
  return {
    day: row.id.split(':').slice(2).join(':'),
    row,
    slot: button.id.split(':').at(-1) ?? slot,
  };
}

export const lastTexts = async (phone: string, count = 3) =>
  (await replies(phone)).slice(-count).map((reply) => reply.body);
