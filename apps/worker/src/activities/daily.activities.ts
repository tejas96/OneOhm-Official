import {
  customers,
  type Database,
  paymentMilestones,
  payments,
  projects,
  queueCustomerMessage,
} from '@oneohm/database';
import { addDays, formatInr, todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { openMaintenanceVisits } from './after-sales';
import { queueCashReminders } from './cash-reminders';
import { queueEscalations } from './escalations';
import { clearOldLocations } from './location-retention';
import { queueOwnerSummaries } from './owner-summary';
import { queueSlaAlerts } from './service-sla';
import { queueStaffDigests } from './staff-digest';

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
          `payment_reminder:${row.id}:${week}`,
        );
        if (fresh) queued += 1;
      }
      return queued;
    },

    async queueOwnerSummaries(): Promise<number> {
      return queueOwnerSummaries(db, todayIn(timeZone));
    },

    async queueCashReminders(): Promise<number> {
      return queueCashReminders(db, todayIn(timeZone));
    },

    async queueEscalations(): Promise<number> {
      return queueEscalations(db, todayIn(timeZone));
    },

    async queueStaffDigests(): Promise<number> {
      return queueStaffDigests(db, todayIn(timeZone));
    },

    async openMaintenanceVisits(): Promise<number> {
      return openMaintenanceVisits(db, todayIn(timeZone));
    },

    async queueSlaAlerts(): Promise<number> {
      return queueSlaAlerts(db, new Date(), timeZone);
    },

    async clearOldLocations(): Promise<number> {
      return clearOldLocations(db, todayIn(timeZone));
    },
  };
}
