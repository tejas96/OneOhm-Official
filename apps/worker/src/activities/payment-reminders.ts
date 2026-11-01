import {
  customers,
  type Database,
  paymentMilestones,
  payments,
  projects,
  queueCustomerMessage,
  readBusinessSetting,
} from '@oneohm/database';
import { paymentReminderRound } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';

/**
 * Customers hear about an unpaid milestone after the grace days in Settings →
 * Reminders, then again every repeat while it stays unpaid (PRD 3.11, 7.2). Each round
 * is sent once, however often the job runs.
 */
export async function queuePaymentReminders(db: Database, timeZone: string): Promise<number> {
  const today = todayIn(timeZone);
  const timing = await readBusinessSetting(db, 'reminders');
  const due = await db
    .select({
      id: paymentMilestones.id,
      label: paymentMilestones.label,
      amount: paymentMilestones.amountPaise,
      dueAt: paymentMilestones.dueAt,
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
        lte(paymentMilestones.dueAt, new Date()),
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
  let queued = 0;
  for (const row of due) {
    if (!row.dueAt) continue;
    const round = paymentReminderRound(todayIn(timeZone, row.dueAt), today, timing);
    if (round === null) continue;
    const received = paid
      .filter((payment) => payment.milestoneId === row.id)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = row.amount - received;
    if (outstanding <= 0) continue;
    const fresh = await queueCustomerMessage(
      db,
      row.phone,
      'payment_reminder',
      {
        customer: row.customer,
        amount: formatInr(outstanding),
        milestone: row.label,
        project: row.projectCode,
      },
      `payment_reminder:${row.id}:round-${round}`,
    );
    if (fresh) queued += 1;
  }
  return queued;
}
