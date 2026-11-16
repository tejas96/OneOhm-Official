// What the month sheet scenario (91-*) needs: last month's working days by the saved rules,
// and a month of history written straight to the database (days already gone cannot be
// tapped through the API).
import { addDays, monthRange, previousMonth } from '@oneohm/shared';
import { rows } from './db';
import type { Session } from './http';
import { indiaDate } from './travel';

export interface Policy {
  weeklyOff: number[];
  leaveTypes: { key: string; label: string; daysPerYear: number; paid?: boolean }[];
  attendance: Record<string, unknown>;
  [key: string]: unknown;
}

/** Last month in India (`YYYY-MM`): over, so it can be locked. */
export const lastMonth = () => previousMonth(indiaDate().slice(0, 7));

export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** Every day of the month, in order. */
export function daysOf(month: string): string[] {
  const { start, end } = monthRange(month);
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The saved workforce policy, and a save that sets the month sheet rules on top of it. */
export async function withSheetRules(admin: Session): Promise<{ saved: Policy; rules: Policy }> {
  const { policy: saved } = await admin.get<{ policy: Policy }>('/settings/workforce');
  const rules: Policy = {
    ...saved,
    leaveTypes: [
      ...saved.leaveTypes.filter((kind) => kind.key !== 'unpaid'),
      { key: 'unpaid', label: 'Unpaid leave', daysPerYear: 0, paid: false },
    ],
    attendance: { ...saved.attendance, halfDayHours: 4, lateDeduction: { every: 3 } },
  };
  await admin.put('/settings/workforce', rules);
  return { saved, rules };
}

/** A worked day in India time, "HH:MM" to "HH:MM". */
export const workDay = (userId: string, day: string, from: string, to: string, late = false) =>
  rows(
    `INSERT INTO attendance_days (user_id, work_date, check_in_at, check_out_at, late)
     VALUES ($1, $2::date, ($2::text || ' ' || $3::text)::timestamp AT TIME ZONE 'Asia/Kolkata',
             ($2::text || ' ' || $4::text)::timestamp AT TIME ZONE 'Asia/Kolkata', $5)`,
    [userId, day, from, to, late],
  );

export const leave = (userId: string, kind: string, day: string, half = false) =>
  rows(
    `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_day, half_days, status, reason)
     VALUES ($1, $2, $3, $3, $4, $5, 'approved', 'Month sheet test')`,
    [userId, kind, day, half, half ? 1 : 2],
  );

/** An approved travel claim; paid ones get an employee payable marked paid. */
export async function approvedClaim(userId: string, day: string, paise: number, paid: boolean) {
  let payableId: string | null = null;
  if (paid) {
    const [bill] = await rows<{ id: string }>(
      `INSERT INTO payables (party, party_name, party_user_id, description, amount_paise, due_on, status, paid_paise, paid_on)
       VALUES ('employee', 'Month Worker (test)', $1, 'Travel', $2, $3, 'paid', $2, $3) RETURNING id`,
      [userId, paise, day],
    );
    payableId = bill?.id ?? null;
  }
  await rows(
    `INSERT INTO travel_claims (user_id, work_date, distance_m, rate_paise_per_km, amount_paise, legs, visits, status, payable_id)
     VALUES ($1, $2, 10000, 500, $3, '[]'::jsonb, 1, 'approved', $4)`,
    [userId, day, paise, payableId],
  );
}

/** A bonus share approved at noon on `day`. */
export async function approvedBonus(userId: string, day: string, paise: number) {
  const [bonus] = await rows<{ id: string }>(
    `INSERT INTO project_bonuses (reason, total_paise, status, decided_at)
     VALUES ('Fast install (test)', $1, 'approved', ($2::text || ' 12:00')::timestamp AT TIME ZONE 'Asia/Kolkata')
     RETURNING id`,
    [paise, day],
  );
  await rows(
    'INSERT INTO project_bonus_shares (bonus_id, user_id, shares, amount_paise) VALUES ($1, $2, 1, $3)',
    [bonus?.id, userId, paise],
  );
}

/** The month's notices to one person of one kind, newest first. */
export const noticesOf = (userId: string, kind: string) =>
  rows<{ title: string; dedupe_key: string }>(
    'SELECT title, dedupe_key FROM notifications WHERE user_id = $1 AND kind = $2 ORDER BY created_at DESC',
    [userId, kind],
  );

/** A person's id by phone. */
export const idOf = async (phone: string) =>
  (await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [phone]))[0]?.id ?? '';
