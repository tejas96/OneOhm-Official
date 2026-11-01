import { type Database, leads, notify, outbox, projectTasks, users } from '@oneohm/database';
import { and, eq, lte, ne, notInArray, sql } from 'drizzle-orm';

interface DayCounts {
  readonly overdue: number;
  readonly today: number;
  readonly followUps: number;
}

async function countsFor(db: Database, userId: string, today: string): Promise<DayCounts> {
  const [tasks] = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${projectTasks.dueDate} < ${today})`,
      today: sql<number>`count(*) filter (where ${projectTasks.dueDate} = ${today})`,
    })
    .from(projectTasks)
    .where(and(eq(projectTasks.assigneeUserId, userId), ne(projectTasks.status, 'completed')));
  const [followUps] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        eq(leads.ownerUserId, userId),
        lte(leads.nextActionOn, today),
        notInArray(leads.stage, ['won', 'lost']),
      ),
    );
  return {
    overdue: Number(tasks?.overdue ?? 0),
    today: Number(tasks?.today ?? 0),
    followUps: Number(followUps?.count ?? 0),
  };
}

function summary(counts: DayCounts): string {
  const parts = [
    counts.overdue > 0 ? `${counts.overdue} overdue` : null,
    counts.today > 0 ? `${counts.today} due today` : null,
    counts.followUps > 0 ? `${counts.followUps} lead follow-ups` : null,
  ];
  return `${parts.filter(Boolean).join(', ')}.`;
}

/**
 * Each morning, everyone with work waiting gets one summary: in the app (and on their
 * phone), and on WhatsApp when their number is known. Returns the WhatsApp messages queued.
 */
export async function queueStaffDigests(db: Database, today: string): Promise<number> {
  const people = await db
    .select({ id: users.id, name: users.fullName, phone: users.phoneE164 })
    .from(users)
    .where(eq(users.status, 'active'));
  let queued = 0;
  for (const person of people) {
    const counts = await countsFor(db, person.id, today);
    if (counts.overdue + counts.today + counts.followUps === 0) continue;
    await notify(
      db,
      { userId: person.id },
      {
        kind: 'staff_daily_digest',
        title: 'Your day',
        body: summary(counts),
        dedupeKey: `notice:staff_digest:${person.id}:${today}`,
      },
    );
    if (!person.phone) continue;
    const inserted = await db
      .insert(outbox)
      .values({
        channel: 'whatsapp',
        recipient: person.phone,
        template: 'staff_daily_digest',
        payload: {
          name: person.name,
          overdue: String(counts.overdue),
          today: String(counts.today),
          followUps: String(counts.followUps),
        },
        dedupeKey: `staff_digest:${person.id}:${today}`,
      })
      .onConflictDoNothing()
      .returning({ id: outbox.id });
    queued += inserted.length;
  }
  return queued;
}
