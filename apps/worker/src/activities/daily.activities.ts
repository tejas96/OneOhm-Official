import {
  customers,
  type Database,
  leads,
  outbox,
  paymentMilestones,
  payments,
  projects,
  projectTasks,
  users,
} from '@oneohm/database';
import { addDays, formatInr, todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, lte, ne, notInArray, sql } from 'drizzle-orm';

/** A customer is reminded about an unpaid milestone at most once a week. */
const REMINDER_GRACE_DAYS = 3;

function weekKey(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  const monday = addDays(today, -((date.getUTCDay() + 6) % 7));
  return monday;
}

/** Queues the morning's messages; the outbox relay delivers them. */
export function dailyActivities(db: Database, timeZone: string) {
  return {
    async queuePaymentReminders(): Promise<number> {
      const today = todayIn(timeZone);
      const cutoff = new Date(`${addDays(today, -REMINDER_GRACE_DAYS)}T23:59:59+05:30`);
      const due = await db
        .select({
          id: paymentMilestones.id,
          label: paymentMilestones.label,
          amount: paymentMilestones.amountPaise,
          projectCode: projects.code,
          customer: customers.name,
          phone: customers.phoneE164,
        })
        .from(paymentMilestones)
        .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
        .innerJoin(customers, eq(customers.id, projects.customerId))
        .where(
          and(
            eq(paymentMilestones.payer, 'customer'),
            inArray(paymentMilestones.status, ['due', 'partly_paid']),
            isNotNull(paymentMilestones.dueAt),
            lte(paymentMilestones.dueAt, cutoff),
            eq(customers.whatsappOptIn, true),
          ),
        );
      if (due.length === 0) return 0;
      const paid = await db
        .select({ milestoneId: payments.milestoneId, amount: payments.amountPaise })
        .from(payments)
        .where(
          inArray(
            payments.milestoneId,
            due.map((row) => row.id),
          ),
        );
      const week = weekKey(today);
      let queued = 0;
      for (const row of due) {
        const received = paid
          .filter((payment) => payment.milestoneId === row.id)
          .reduce((sum, payment) => sum + payment.amount, 0);
        const outstanding = row.amount - received;
        if (outstanding <= 0) continue;
        const inserted = await db
          .insert(outbox)
          .values({
            channel: 'whatsapp',
            recipient: row.phone,
            template: 'payment_reminder',
            payload: {
              customer: row.customer,
              amount: formatInr(outstanding),
              milestone: row.label,
              project: row.projectCode,
            },
            dedupeKey: `payment_reminder:${row.id}:${week}`,
          })
          .onConflictDoNothing()
          .returning({ id: outbox.id });
        queued += inserted.length;
      }
      return queued;
    },

    async queueStaffDigests(): Promise<number> {
      const today = todayIn(timeZone);
      const people = await db
        .select({ id: users.id, name: users.fullName, phone: users.phoneE164 })
        .from(users)
        .where(and(eq(users.status, 'active'), isNotNull(users.phoneE164)));
      let queued = 0;
      for (const person of people) {
        if (!person.phone) continue;
        const [counts] = await db
          .select({
            overdue: sql<number>`count(*) filter (where ${projectTasks.dueDate} < ${today})`,
            today: sql<number>`count(*) filter (where ${projectTasks.dueDate} = ${today})`,
          })
          .from(projectTasks)
          .where(
            and(eq(projectTasks.assigneeUserId, person.id), ne(projectTasks.status, 'completed')),
          );
        const [followUps] = await db
          .select({ count: sql<number>`count(*)` })
          .from(leads)
          .where(
            and(
              eq(leads.ownerUserId, person.id),
              lte(leads.nextActionOn, today),
              notInArray(leads.stage, ['won', 'lost']),
            ),
          );
        const overdue = Number(counts?.overdue ?? 0);
        const dueToday = Number(counts?.today ?? 0);
        const leadsDue = Number(followUps?.count ?? 0);
        if (overdue + dueToday + leadsDue === 0) continue;
        const inserted = await db
          .insert(outbox)
          .values({
            channel: 'whatsapp',
            recipient: person.phone,
            template: 'staff_daily_digest',
            payload: {
              name: person.name,
              overdue: String(overdue),
              today: String(dueToday),
              followUps: String(leadsDue),
            },
            dedupeKey: `staff_digest:${person.id}:${today}`,
          })
          .onConflictDoNothing()
          .returning({ id: outbox.id });
        queued += inserted.length;
      }
      return queued;
    },
  };
}
