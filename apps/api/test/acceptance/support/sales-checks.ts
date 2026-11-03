import { rows } from './db';
import type { Session } from './http';

/** Helpers for the sales checks: a time in India, the checks run by hand, the alerts they raised. */
export const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

export const runSalesChecks = (admin: Session, now: Date) =>
  admin.post<{ expiring: number; calls: number; noProject: number }>('/sales-checks/run', {
    now: now.toISOString(),
  });

/** The alerts whose dedupe key starts with this, one row per person told. */
export const alertsKeyed = (prefix: string) =>
  rows<{ user_id: string; title: string }>(
    'SELECT user_id, title FROM notifications WHERE dedupe_key LIKE $1',
    [`${prefix}%`],
  );

/** The lead's next action: its day, time and what to do. */
export async function nextActionOf(leadId: string) {
  const [lead] = await rows<{ day: string; time: string | null; note: string }>(
    `SELECT to_char(next_action_on, 'YYYY-MM-DD') AS day, next_action_time::text AS time,
            next_action_note AS note FROM leads WHERE id = $1`,
    [leadId],
  );
  return lead;
}
