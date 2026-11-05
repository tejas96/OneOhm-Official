import { type DatabaseExecutor, leaveRequests, users, visits } from '@oneohm/database';
import { freeVisitDays, OPEN_VISIT_STATUSES, type VisitSlot } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

const LOOK_AHEAD = 45;

/** Slots already taken per day by anyone of the crew (open visits), from tomorrow. */
export async function takenSlots(
  db: DatabaseExecutor,
  crew: readonly string[],
  today: string,
  exceptVisitId?: string,
): Promise<Record<string, VisitSlot[]>> {
  const taken: Record<string, VisitSlot[]> = {};
  if (crew.length === 0) return taken;
  const rows = await db
    .select({ day: visits.day, slot: visits.slot })
    .from(visits)
    .where(
      and(
        inArray(visits.status, [...OPEN_VISIT_STATUSES]),
        gte(visits.day, today),
        lte(visits.day, addDays(today, LOOK_AHEAD)),
        sql`${visits.crewUserIds} && ARRAY[${sql.join(
          crew.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]`,
        exceptVisitId ? ne(visits.id, exceptVisitId) : undefined,
      ),
    );
  for (const row of rows) taken[row.day] = [...(taken[row.day] ?? []), row.slot];
  return taken;
}

/** The days the crew is away (leave asked or approved), from today. */
async function leaveDays(db: DatabaseExecutor, crew: readonly string[], today: string) {
  const days = new Set<string>();
  if (crew.length === 0) return days;
  const end = addDays(today, LOOK_AHEAD);
  const rows = await db
    .select({ from: leaveRequests.fromDate, to: leaveRequests.toDate })
    .from(leaveRequests)
    .where(
      and(
        inArray(leaveRequests.userId, [...crew]),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.fromDate, end),
        gte(leaveRequests.toDate, today),
      ),
    );
  for (const row of rows)
    for (let day = row.from; day <= row.to && day <= end; day = addDays(day, 1)) days.add(day);
  return days;
}

/**
 * The next working days the crew is free (existing leave and open visits are the capacity data).
 * Material readiness for an installation is not checked: the data is not kept per project.
 */
export async function freeDaysFor(
  db: DatabaseExecutor,
  crew: readonly string[],
  count: number,
  exceptVisitId?: string,
  timeZone = 'Asia/Kolkata',
): Promise<string[]> {
  const today = todayIn(timeZone);
  return freeVisitDays({
    today,
    count,
    leave: await leaveDays(db, crew, today),
    taken: await takenSlots(db, crew, today, exceptVisitId),
  });
}

/** The first name and number of the person who comes, for "Ravi will call before coming". */
export async function contactOf(
  db: DatabaseExecutor,
  userId: string | null | undefined,
): Promise<{ name: string; phone: string } | null> {
  if (!userId) return null;
  const [user] = await db
    .select({ name: users.fullName, phone: users.phoneE164 })
    .from(users)
    .where(eq(users.id, userId));
  return user ? { name: user.name.split(/\s+/)[0] ?? user.name, phone: user.phone ?? '' } : null;
}

/** Why a person cannot take a visit on a day: on leave, or already holding that slot. */
export async function busyOn(
  db: DatabaseExecutor,
  userId: string,
  day: string,
  slot: VisitSlot,
  exceptVisitId: string,
  timeZone = 'Asia/Kolkata',
): Promise<'leave' | 'booked' | null> {
  const today = todayIn(timeZone);
  if ((await leaveDays(db, [userId], today)).has(day)) return 'leave';
  const taken = await takenSlots(db, [userId], today, exceptVisitId);
  return (taken[day] ?? []).includes(slot) ? 'booked' : null;
}
