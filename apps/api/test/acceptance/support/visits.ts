import type { Visit, VisitSettingsRecord, VisitsOf } from '@oneohm/api-contracts';
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

/**
 * The team book (or move) a visit. With only a half of the day, it takes the first time of that
 * half the person still has free (else the first free time that day), so scenarios that share a
 * person do not trip over each other's exact times; `startMin` books exactly that time.
 */
export async function setVisit(admin: Session, body: Record<string, string | number>) {
  if (
    body.startMin === undefined &&
    typeof body.day === 'string' &&
    typeof body.slot === 'string'
  ) {
    const { day, slot, ...scope } = body;
    const free = (await visitsOf(admin, scopeOnly(scope))).freeTimes[day] ?? [];
    const half = (one: { startMin: number }) => (one.startMin < 720 ? 'morning' : 'afternoon');
    const time = free.find((one) => half(one) === slot) ?? free[0];
    if (time) return admin.post<Visit>('/visits', { ...body, startMin: time.startMin });
  }
  return admin.post<Visit>('/visits', body);
}

const scopeOnly = (body: Record<string, string | number>) =>
  Object.fromEntries(
    Object.entries(body).filter(([key]) =>
      ['taskId', 'leadId', 'serviceRequestId', 'projectId'].includes(key),
    ),
  ) as Record<string, string>;

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

/**
 * Picks the first day on the list and a time, as the customer. `slot` is the half of the day
 * (morning = before noon) or an exact start in minutes; else the first free time that day.
 */
export async function pickDay(
  phone: string,
  list: SentReply | undefined,
  slot: 'morning' | 'afternoon' | number = 'morning',
) {
  const row = list?.rows?.find((one) => one.id.startsWith('vday:'));
  if (!row) throw new Error('No day on the list.');
  await tap(phone, row.id);
  const times = await lastReply(phone);
  const options = (times?.rows ?? []).filter((one) => one.id.startsWith('vtime:'));
  const startOf = (id: string) => Number(id.split(':').at(-1));
  const wanted = (one: { id: string }) =>
    typeof slot === 'number'
      ? startOf(one.id) === slot
      : (startOf(one.id) < 720 ? 'morning' : 'afternoon') === slot;
  // The time asked for, else the first one the crew still has free that day.
  const chosen = options.find(wanted) ?? options[0];
  if (!chosen) throw new Error('No time on the list.');
  await tap(phone, chosen.id);
  const startMin = startOf(chosen.id);
  return {
    day: row.id.split(':').slice(2).join(':'),
    row,
    startMin,
    label: chosen.title,
    times: options,
    slot: startMin < 720 ? 'morning' : 'afternoon',
  };
}

export const lastTexts = async (phone: string, count = 3) =>
  (await replies(phone)).slice(-count).map((reply) => reply.body);

/**
 * Switches "book customer picks at once" off (the team confirm each pick, as before), for a
 * file about the staff-confirm flow; returns the call that puts the saved settings back.
 */
export async function teamConfirmsPicks(admin: Session) {
  const before = await admin.get<VisitSettingsRecord>('/settings/visits');
  await admin.put('/settings/visits', { ...before, autoConfirmCustomerPicks: false });
  return () => admin.put('/settings/visits', before);
}
