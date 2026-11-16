// What the Duty Day step-5 scenarios (90-*) share: the alert rows, the five-minute alert job
// run the way the worker runs it, and the business hours opened to the whole day for it.
import { invalidateBusinessCalendar, sweepDutyAlerts } from '@oneohm/database';
import { acceptanceDb, rows } from './db';
import type { Session } from './http';
import { indiaDate } from './travel';

export interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  subject_type: string;
  subject_id: string;
  day: string;
  title: string;
  detail: Record<string, unknown>;
  seen_by: string | null;
  resolved_at: Date | null;
  resolved_reason: string | null;
}

/** A person's duty alerts, oldest first; only of one kind when given. */
export const alertsOf = (personId: string, kind?: string) =>
  rows<AlertRow>(
    `SELECT id, kind, severity, subject_type, subject_id, day::text AS day, title, detail,
            seen_by, resolved_at, resolved_reason
       FROM duty_alerts WHERE person_id = $1 AND ($2::text IS NULL OR kind = $2) ORDER BY created_at`,
    [personId, kind ?? null],
  );

/** Alerts a person was sent about one duty alert (by its notice key, `alertNoticeKey`). */
export const noticesFor = (alertId: string) =>
  rows<{ user_id: string; kind: string }>(
    // One key per alert; a travel claim's alert is keyed by the claim (`alertNoticeKey`).
    `SELECT n.user_id, n.kind FROM notifications n, duty_alerts a
      WHERE a.id = $1
        AND n.dedupe_key LIKE CASE WHEN a.subject_type = 'travel_claim'
          THEN 'duty_alert:' || a.kind || ':' || a.subject_id || '%'
          ELSE 'duty_alert:' || a.id || '%' END`,
    [alertId],
  );

/** The worker's five-minute alert job, once, against the acceptance database. */
export async function sweep(now = new Date()): Promise<number> {
  invalidateBusinessCalendar();
  return sweepDutyAlerts(acceptanceDb().db, now);
}

interface WorkingTime {
  weeklyOff: number[];
  dayStart: string;
  dayEnd: string;
  lunchStart: string | null;
  lunchEnd: string | null;
  holidays: { day: string; name: string }[];
}

/**
 * Runs `work` with today a working day open from midnight (no weekly off, no holiday today),
 * so "not checked in 30 minutes after the day start" can be judged at any hour; the saved
 * working time is put back after.
 */
export async function wholeWorkingDay<T>(admin: Session, work: () => Promise<T>): Promise<T> {
  const saved = await admin.get<WorkingTime>('/settings/working-time');
  const today = indiaDate();
  await admin.put('/settings/working-time', {
    ...saved,
    weeklyOff: [],
    dayStart: '00:00',
    dayEnd: '23:59',
    lunchStart: null,
    lunchEnd: null,
    holidays: saved.holidays.filter((holiday) => holiday.day !== today),
  });
  try {
    return await work();
  } finally {
    await admin.put('/settings/working-time', saved);
    invalidateBusinessCalendar();
  }
}

/** Minutes after midnight, India time, now. */
export function indiaMinutes(): number {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .split(':')
    .map(Number);
  return hours * 60 + minutes;
}

/** A confirmed planned visit today for a task, with its crew, starting at `startMin`. */
export const plannedVisit = (taskId: string, crewId: string, startMin: number) =>
  rows(
    `INSERT INTO visits (kind, status, customer_id, project_id, task_id, day, slot, start_min, end_min, proposed_by, crew_user_ids)
     SELECT 'survey', 'confirmed', p.customer_id, p.id, t.id, $2, 'morning', $3, $3 + 30, 'staff', ARRAY[$4]::uuid[]
       FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
    [taskId, indiaDate(), startMin, crewId],
  );
