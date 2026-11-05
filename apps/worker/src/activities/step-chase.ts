import {
  customerActions,
  customers,
  type Database,
  notifyCover,
  notifyHolders,
  projectActivities,
  projects,
  projectTasks,
  readBusinessSetting,
} from '@oneohm/database';
import { subsidyChaseDue } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';

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
        // A cancelled project has nothing more to chase.
        or(isNull(projects.id), ne(projects.status, 'cancelled')),
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

/**
 * The day to sign the loan papers at the bank passed and the customer never confirmed: the ask closes
 * itself the day after (cancelled, answer "expired"), the project log says so and the step's owner is
 * told, so nothing is chased for a day that is gone. No message goes to the customer.
 */
export async function expireBankSigns(db: Database, now: Date, timeZone: string): Promise<number> {
  const today = todayIn(timeZone, now);
  const late = await db
    .select({
      action: customerActions,
      assignee: projectTasks.assigneeUserId,
      manager: projects.managerUserId,
    })
    .from(customerActions)
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .leftJoin(projectTasks, eq(projectTasks.id, customerActions.taskId))
    .where(
      and(
        eq(customerActions.type, 'confirm'),
        eq(customerActions.status, 'open'),
        sql`${customerActions.payload}->>'kind' = 'bank_sign'`,
        sql`${customerActions.payload}->>'day' < ${today}`,
      ),
    )
    .limit(PER_TICK);
  for (const { action, assignee, manager } of late) {
    const bank = String(action.payload.bank ?? 'the bank');
    const day = String(action.payload.dayText ?? action.payload.day ?? '');
    // The status change and the log line stand or fall together; an answer the customer gave stays.
    const closed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(customerActions)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          updatedAt: now,
          payload: {
            ...action.payload,
            expired: true,
            ...(action.payload.answer ? {} : { answer: 'expired' }),
          },
        })
        .where(and(eq(customerActions.id, action.id), eq(customerActions.status, 'open')))
        .returning({ id: customerActions.id });
      if (!row || !action.projectId) return false;
      await tx.insert(projectActivities).values({
        projectId: action.projectId,
        taskId: action.taskId,
        kind: 'customer_action',
        message: `The visit to ${bank} on ${day} was not confirmed, so the ask closed. Please plan a new day.`,
        data: { customerActionId: action.id },
      });
      return true;
    });
    if (!closed || !action.projectId) continue;
    const notice = {
      kind: 'bank_sign_expired',
      title: `Bank visit on ${day} was never confirmed`,
      body: `The customer did not answer for ${bank}. Please call them and plan a new day.`,
      subject: { type: 'project' as const, id: action.projectId },
      dedupeKey: `bank_sign_expired:${action.id}`,
    };
    const person = assignee ?? manager;
    if (person) await notifyCover(db, person, 'projects.manage', notice);
    else await notifyHolders(db, 'projects.manage', notice);
  }
  return late.length;
}
