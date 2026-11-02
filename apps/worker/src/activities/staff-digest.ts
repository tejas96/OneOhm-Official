import {
  type Database,
  leads,
  leaveRequests,
  notify,
  outbox,
  projectTasks,
  taskDependencies,
  taskFreshness,
  users,
} from '@oneohm/database';
import { and, eq, gte, inArray, lte, ne, notInArray, or, sql } from 'drizzle-orm';

interface DayCounts {
  readonly overdue: number;
  readonly today: number;
  readonly followUps: number;
  readonly stale: number;
  readonly urgent: number;
  readonly blocking: number;
}

/** Stale, Urgent and holding-up counts for one person's open tasks (spec 3.5). */
async function ownershipCounts(db: Database, userId: string, today: string) {
  const mine = await db
    .select({
      id: projectTasks.id,
      status: projectTasks.status,
      priority: projectTasks.priority,
      assigneeUserId: projectTasks.assigneeUserId,
      updatedAt: projectTasks.updatedAt,
    })
    .from(projectTasks)
    .where(and(eq(projectTasks.assigneeUserId, userId), ne(projectTasks.status, 'completed')));
  if (mine.length === 0) return { stale: 0, urgent: 0, blocking: 0 };
  const fresh = await taskFreshness(db, mine, today);
  const holding = await db
    .selectDistinct({ id: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.taskId))
    .where(
      and(
        inArray(
          taskDependencies.dependsOnTaskId,
          mine.map((task) => task.id),
        ),
        ne(projectTasks.status, 'completed'),
      ),
    );
  // Only work the person can move now counts as holding others up (spec anti-goal: noise).
  const workable = new Set(
    mine
      .filter((task) => task.status === 'ready' || task.status === 'in_progress')
      .map((t) => t.id),
  );
  return {
    stale: mine.filter((task) => fresh.get(task.id)?.stale).length,
    urgent: mine.filter((task) => task.priority === 'urgent').length,
    blocking: holding.filter((row) => workable.has(row.id)).length,
  };
}

/** On approved leave today: no summary that day (spec 3.5). */
async function onLeaveToday(db: Database, userId: string, today: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, userId),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.fromDate, today),
        gte(leaveRequests.toDate, today),
      ),
    )
    .limit(1);
  return Boolean(row);
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
        or(
          and(lte(leads.nextActionOn, today), notInArray(leads.stage, ['won', 'lost'])),
          // A lost lead whose revisit day has come is a follow-up again (PRD 3.3).
          and(eq(leads.stage, 'lost'), lte(leads.revisitOn, today)),
        ),
      ),
    );
  return {
    overdue: Number(tasks?.overdue ?? 0),
    today: Number(tasks?.today ?? 0),
    followUps: Number(followUps?.count ?? 0),
    ...(await ownershipCounts(db, userId, today)),
  };
}

/** Stale and Urgent work earn a summary; "blocking others" alone does not (spec 3.5). */
export function shouldSendDigest(counts: DayCounts): boolean {
  return counts.overdue + counts.today + counts.followUps + counts.stale + counts.urgent > 0;
}

/** The approved WhatsApp template shows only these three, so skip it when all are zero. */
export function shouldSendWhatsapp(counts: DayCounts): boolean {
  return counts.overdue + counts.today + counts.followUps > 0;
}

/** One line for the morning summary: only what is above zero, most pressing first. */
export function digestSummary(counts: DayCounts): string {
  const parts = [
    counts.urgent > 0 ? `${counts.urgent} urgent` : null,
    counts.overdue > 0 ? `${counts.overdue} overdue` : null,
    counts.today > 0 ? `${counts.today} due today` : null,
    counts.stale > 0 ? `${counts.stale} stale` : null,
    counts.blocking > 0 ? `${counts.blocking} blocking others` : null,
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
    // Nobody is reminded on a day of approved leave (spec 3.5).
    if (await onLeaveToday(db, person.id, today)) continue;
    const counts = await countsFor(db, person.id, today);
    if (!shouldSendDigest(counts)) continue;
    await notify(
      db,
      { userId: person.id },
      {
        kind: 'staff_daily_digest',
        title: 'Your day',
        body: digestSummary(counts),
        dedupeKey: `notice:staff_digest:${person.id}:${today}`,
      },
    );
    if (!person.phone || !shouldSendWhatsapp(counts)) continue;
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
