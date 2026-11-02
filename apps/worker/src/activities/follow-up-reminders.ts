import { type Database, leads, notify, readBusinessSetting } from '@oneohm/database';
import { followUpHorizon } from '@oneohm/domain';
import { and, between, eq, isNotNull, lte, notInArray } from 'drizzle-orm';

const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const when = (date: string, today: string) =>
  date === today ? 'today' : DAY.format(new Date(`${date}T00:00:00Z`));

/**
 * The lead owner hears ahead of each follow-up, as many days before as Settings →
 * Reminders says (PRD 3.3, 7.2). One alert per lead per follow-up date.
 */
export async function queueFollowUpReminders(db: Database, today: string): Promise<number> {
  const timing = await readBusinessSetting(db, 'reminders');
  const horizon = followUpHorizon(today, timing);
  const open = await db
    .select({
      id: leads.id,
      name: leads.name,
      owner: leads.ownerUserId,
      on: leads.nextActionOn,
      note: leads.nextActionNote,
    })
    .from(leads)
    .where(
      and(
        isNotNull(leads.ownerUserId),
        notInArray(leads.stage, ['won', 'lost']),
        between(leads.nextActionOn, today, horizon),
      ),
    );
  // A lost lead with a revisit day is a follow-up again on that day (PRD 3.3).
  const revisits = await db
    .select({ id: leads.id, name: leads.name, owner: leads.ownerUserId, on: leads.revisitOn })
    .from(leads)
    .where(
      and(
        isNotNull(leads.ownerUserId),
        eq(leads.stage, 'lost'),
        between(leads.revisitOn, today, horizon),
      ),
    );
  const due = [...open, ...revisits.map((lead) => ({ ...lead, note: 'Try this lead again.' }))];
  for (const lead of due) {
    if (!lead.owner || !lead.on) continue;
    await notify(
      db,
      { userId: lead.owner },
      {
        kind: 'lead_follow_up',
        title: `Follow up with ${lead.name} ${when(lead.on, today)}`,
        body: lead.note?.trim() || 'Call or visit as planned.',
        subject: { type: 'lead', id: lead.id },
        dedupeKey: `lead_follow_up:${lead.id}:${lead.on}`,
      },
    );
  }
  return due.length;
}

/** How long before a follow-up's set time its owner is alerted. */
export const TIMED_FOLLOW_UP_LEAD_MINUTES = 15;

/** "HH:MM" plus some minutes, capped at the end of the day. */
export function clockPlus(clock: string, minutes: number): string {
  const [hour = 0, minute = 0] = clock.split(':').map(Number);
  const total = Math.min(hour * 60 + minute + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Runs every few minutes: a follow-up with a time today alerts its owner a little before
 * that time (once per lead, day and time).
 */
export async function queueTimedFollowUps(
  db: Database,
  today: string,
  clock: string,
): Promise<number> {
  const due = await db
    .select({
      id: leads.id,
      name: leads.name,
      owner: leads.ownerUserId,
      time: leads.nextActionTime,
      note: leads.nextActionNote,
    })
    .from(leads)
    .where(
      and(
        isNotNull(leads.ownerUserId),
        notInArray(leads.stage, ['won', 'lost']),
        eq(leads.nextActionOn, today),
        isNotNull(leads.nextActionTime),
        lte(leads.nextActionTime, clockPlus(clock, TIMED_FOLLOW_UP_LEAD_MINUTES)),
      ),
    );
  for (const lead of due) {
    if (!lead.owner || !lead.time) continue;
    await notify(
      db,
      { userId: lead.owner },
      {
        kind: 'lead_follow_up',
        title: `Follow up with ${lead.name} at ${lead.time}`,
        body: lead.note?.trim() || 'Call or visit as planned.',
        subject: { type: 'lead', id: lead.id },
        dedupeKey: `lead_follow_up_at:${lead.id}:${today}:${lead.time}`,
      },
    );
  }
  return due.length;
}
