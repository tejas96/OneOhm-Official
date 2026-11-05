import { rows } from './db';
import type { Session } from './http';
import { replies } from './onboarding';
import { addDays, today } from './sales';

/** Helpers for the onboarding nudge scenarios: a chosen clock, an aged chat, the job run by hand. */
export const HOUR = 3_600_000;
/**
 * The latest working day's 11:00 in India that is an hour or more in the past (never a
 * Sunday): the quiet hours before it and a run an hour after it are always in the past, so
 * a tap sent now is never older than the chat's last message, whatever hour the suite runs.
 */
function pastNoon(): Date {
  for (let day = today(); ; day = addDays(day, -1)) {
    const at = new Date(`${day}T11:00:00+05:30`);
    const sunday = new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
    if (!sunday && at.getTime() + HOUR <= Date.now()) return at;
  }
}
export const NOON = pastNoon();
/** NOON's day (YYYY-MM-DD): the day leads made by a run at NOON are due. */
export const NUDGE_DAY = new Date(NOON.getTime() + 5.5 * HOUR).toISOString().slice(0, 10);
/** The night before NOON, also in the past. */
export const NIGHT = new Date(`${addDays(NUDGE_DAY, -1)}T23:00:00+05:30`);
export const NUDGE = 'Shall we continue? It takes a minute.';

/** The customer went quiet this many hours before `now`. */
export const silentFor = (phone: string, hours: number, now = NOON) =>
  rows(`UPDATE wa_conversations SET last_inbound_at = $2 WHERE phone = $1 RETURNING id`, [
    phone,
    new Date(now.getTime() - hours * HOUR),
  ]);

export const runNudges = (admin: Session, now = NOON) =>
  admin.post<{ nudged: number; leads: number }>('/whatsapp/onboarding-nudges/run', {
    now: now.toISOString(),
  });

export const nudgesTo = async (phone: string) =>
  (await replies(phone)).filter((reply) => reply.body === NUDGE);
