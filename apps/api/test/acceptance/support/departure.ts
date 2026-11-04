import { rows } from './db';
import { Session } from './http';
import type { OwnPerson } from './people';
import { addDays, today, uniquePhone } from './sales';

/**
 * What wrap-up shuts down when someone leaves: a signed-in phone, a push device, location
 * consent, an open site visit, today's open attendance, a pending leave request, approved
 * leave after the last day (approved leave before it stays), an unused sign-in code and a
 * queued WhatsApp message to them. Rows are tagged for clean-up.
 */
export async function seedWrapUp(person: OwnPerson, tag: string): Promise<void> {
  await Session.code(person.phone);
  await rows(
    "INSERT INTO push_devices (user_id, token, platform, app) VALUES ($1, $2, 'android', 'field')",
    [person.id, `token-${uniquePhone()}`],
  );
  await rows('INSERT INTO location_consents (user_id, consented_at) VALUES ($1, now())', [
    person.id,
  ]);
  await rows(
    `INSERT INTO site_visits (user_id, kind, work_date, check_in_at)
     VALUES ($1, 'survey', $2, now())`,
    [person.id, today()],
  );
  await rows(
    'INSERT INTO attendance_days (user_id, work_date, check_in_at) VALUES ($1, $2, now())',
    [person.id, today()],
  );
  await rows(
    `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason)
     VALUES ($1, 'casual', $2, $2, 2, 'pending', $3)`,
    [person.id, addDays(today(), 9), tag],
  );
  for (const [days, label] of [
    [5, 'ahead'],
    [-3, 'taken'],
  ] as const)
    await rows(
      `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason)
       VALUES ($1, 'casual', $2, $2, 2, 'approved', $3)`,
      [person.id, addDays(today(), days), `${tag} ${label}`],
    );
  await rows(
    `INSERT INTO otp_challenges (phone_e164, code_hash, expires_at)
     VALUES ($1, 'unused', now() + interval '10 minutes')`,
    [person.phone],
  );
  await rows(
    `INSERT INTO outbox (channel, recipient, template, payload, dedupe_key)
     VALUES ('whatsapp', $1, 'staff_digest', '{}'::jsonb, $2)`,
    [person.phone, `${tag}:${person.id}`],
  );
}

/** The same rows after removal, as one object to compare with `WRAPPED_UP`. */
export async function wrapUpState(person: OwnPerson, tag: string) {
  const [state] = await rows<Record<string, unknown>>(
    `SELECT
       (SELECT count(*)::int FROM sessions WHERE user_id = $1) AS sessions,
       (SELECT disabled_reason FROM push_devices WHERE user_id = $1 AND disabled_at IS NOT NULL) AS device,
       (SELECT withdrawn_at IS NOT NULL FROM location_consents WHERE user_id = $1) AS withdrawn,
       (SELECT count(*)::int FROM site_visits WHERE user_id = $1 AND check_out_at IS NULL) AS visits,
       (SELECT count(*)::int FROM attendance_days WHERE user_id = $1 AND check_out_at IS NULL) AS days,
       (SELECT status::text FROM leave_requests WHERE user_id = $1 AND reason = $4) AS leave,
       (SELECT status::text FROM leave_requests WHERE user_id = $1 AND reason = $4 || ' ahead') AS ahead,
       (SELECT status::text FROM leave_requests WHERE user_id = $1 AND reason = $4 || ' taken') AS taken,
       (SELECT count(*)::int FROM otp_challenges WHERE phone_e164 = $2 AND consumed_at IS NULL) AS codes,
       (SELECT status::text FROM outbox WHERE dedupe_key = $3) AS outbox`,
    [person.id, person.phone, `${tag}:${person.id}`, tag],
  );
  return state;
}

export const WRAPPED_UP = {
  sessions: 0,
  device: 'left_team',
  withdrawn: true,
  visits: 0,
  days: 0,
  leave: 'cancelled',
  ahead: 'cancelled',
  taken: 'approved',
  codes: 0,
  outbox: 'skipped',
} as const;
