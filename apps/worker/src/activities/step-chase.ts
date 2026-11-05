import {
  customerActions,
  customers,
  type Database,
  notifyCover,
  notifyHolders,
  projects,
  projectTasks,
  readBusinessSetting,
} from '@oneohm/database';
import { subsidyChaseDue } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, asc, eq, sql } from 'drizzle-orm';

const PER_TICK = 200;

/**
 * A customer said the subsidy has not reached their bank (redesign §4 Subsidy): once the days set in
 * Settings → Reminders have passed since that answer, the owner of the subsidy step (else the project
 * manager, else those who manage projects) is told once. The ask stays open, so Home still shows it.
 * Every tick is safe to repeat: the alert has one key per ask.
 */
export async function chaseSubsidy(db: Database, now: Date): Promise<number> {
  const { subsidyChaseDays } = await readBusinessSetting(db, 'reminders');
  const waiting = await db
    .select({
      action: customerActions,
      customer: customers.name,
      assignee: projectTasks.assigneeUserId,
      manager: projects.managerUserId,
    })
    .from(customerActions)
    .innerJoin(customers, eq(customers.id, customerActions.customerId))
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .leftJoin(projectTasks, eq(projectTasks.id, customerActions.taskId))
    .where(
      and(
        eq(customerActions.type, 'confirm'),
        eq(customerActions.status, 'open'),
        sql`${customerActions.payload}->>'kind' = 'subsidy_credit'`,
        sql`${customerActions.payload}->>'answer' = 'not_yet'`,
      ),
    )
    .orderBy(asc(customerActions.createdAt))
    .limit(PER_TICK);
  let told = 0;
  for (const { action, customer, assignee, manager } of waiting) {
    const said = new Date(String(action.payload.answeredAt ?? ''));
    if (Number.isNaN(said.getTime()) || !subsidyChaseDue(said, now, subsidyChaseDays)) continue;
    const notice = {
      kind: 'subsidy_not_received',
      title: `${customer} says the subsidy has not reached them`,
      body: `They answered Not yet on ${said.toISOString().slice(0, 10)} about ${formatInr(Number(action.payload.amountPaise ?? 0))}. Please check with the portal and call them.`,
      ...(action.projectId ? { subject: { type: 'project' as const, id: action.projectId } } : {}),
      dedupeKey: `subsidy_not_received:${action.id}`,
    };
    const person = assignee ?? manager;
    if (person) await notifyCover(db, person, 'projects.manage', notice);
    else await notifyHolders(db, 'projects.manage', notice);
    told += 1;
  }
  return told;
}
