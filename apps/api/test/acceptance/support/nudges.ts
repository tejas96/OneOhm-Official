import { rows } from './db';
import type { Session } from './http';
import { replies } from './onboarding';
import { today } from './sales';

/** Helpers for the onboarding nudge scenarios: a chosen clock, an aged chat, the job run by hand. */
export const HOUR = 3_600_000;
export const NOON = new Date(`${today()}T11:00:00+05:30`);
export const NIGHT = new Date(`${today()}T23:00:00+05:30`);
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
