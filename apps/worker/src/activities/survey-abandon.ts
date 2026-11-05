import { customerActions, type Database, projectActivities } from '@oneohm/database';
import { and, eq, lte, sql } from 'drizzle-orm';
import { askedSince } from './journey-reminders';

const DAY = 24 * 3_600_000;
const PER_TICK = 200;

/**
 * A self survey the customer started and never sent is given up 7 days after the later of the start and the
 * engineer's last ask-again: it is cancelled, the log says "abandoned" and the chat stops waiting for a photo.
 */
export async function abandonSurveys(db: Database, now: Date): Promise<number> {
  const open = await db
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.type, 'self_survey'),
        eq(customerActions.status, 'open'),
        sql`${customerActions.payload}->>'startedAt' is not null`,
        lte(customerActions.updatedAt, new Date(now.getTime() - 7 * DAY)),
      ),
    )
    .limit(PER_TICK);
  let done = 0;
  for (const ask of open) {
    if (now.getTime() - askedSince(ask).getTime() < 7 * DAY) continue;
    const [gone] = await db
      .update(customerActions)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
        payload: { ...ask.payload, awaiting: null, abandonedAt: now.toISOString() },
      })
      .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, 'open')))
      .returning({ id: customerActions.id });
    if (!gone) continue;
    done += 1;
    if (ask.projectId)
      await db.insert(projectActivities).values({
        projectId: ask.projectId,
        taskId: ask.taskId,
        kind: 'customer_action',
        message: 'Self survey abandoned: the customer did not finish it in 7 days.',
        data: { customerActionId: ask.id },
      });
  }
  return done;
}
