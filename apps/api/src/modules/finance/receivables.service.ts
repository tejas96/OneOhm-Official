import { Inject, Injectable } from '@nestjs/common';
import type { Receivable } from '@oneohm/api-contracts';
import { businessDate, customers, paymentMilestones, payments, projects } from '@oneohm/database';
import { ageingBucket } from '@oneohm/domain';
import { daysBetween, todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { openLinksFor } from '../online-payments/open-links';

/**
 * Everything still owed to OneOhm, milestone by milestone (PRD 3.11). A milestone is
 * due once its due date is set; before that it shows as "not due yet", even when an
 * advance has part-paid it. The subsidy is never here.
 */
@Injectable()
export class ReceivablesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<Receivable[]> {
    const rows = await this.db
      .select({
        milestone: paymentMilestones,
        projectCode: projects.code,
        customerName: customers.name,
      })
      .from(paymentMilestones)
      .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(and(ne(paymentMilestones.status, 'paid'), ne(projects.status, 'cancelled')))
      .orderBy(asc(paymentMilestones.dueAt), asc(projects.code), asc(paymentMilestones.position));
    if (rows.length === 0) return [];
    const paid = await this.db
      .select({
        milestoneId: payments.milestoneId,
        total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)`,
      })
      .from(payments)
      .where(
        inArray(
          payments.milestoneId,
          rows.map((row) => row.milestone.id),
        ),
      )
      .groupBy(payments.milestoneId);
    const paidBy = new Map(paid.map((row) => [row.milestoneId, Number(row.total)]));
    const links = await openLinksFor(
      this.db,
      rows.map((row) => row.milestone.id),
    );
    const today = todayIn();
    return rows
      .map(({ milestone, projectCode, customerName }): Receivable => {
        const paidPaise = paidBy.get(milestone.id) ?? 0;
        const dueOn = milestone.dueAt ? businessDate(milestone.dueAt) : null;
        const daysSinceDue = dueOn ? Math.max(0, daysBetween(dueOn, today)) : null;
        const status = milestone.status === 'paid' ? 'partly_paid' : milestone.status;
        return {
          milestoneId: milestone.id,
          projectId: milestone.projectId,
          projectCode,
          customerName,
          payer: milestone.payer,
          label: milestone.label,
          amountPaise: milestone.amountPaise,
          paidPaise,
          outstandingPaise: milestone.amountPaise - paidPaise,
          status,
          dueOn,
          daysSinceDue,
          bucket: daysSinceDue === null ? null : ageingBucket(daysSinceDue),
          nextAction:
            dueOn === null
              ? 'not_due_yet'
              : milestone.payer === 'bank'
                ? 'claim_from_bank'
                : 'collect_from_customer',
          link: links.get(milestone.id) ?? null,
        };
      })
      .filter((receivable) => receivable.outstandingPaise > 0)
      .sort(
        (left, right) =>
          (right.daysSinceDue ?? -1) - (left.daysSinceDue ?? -1) ||
          left.projectCode.localeCompare(right.projectCode),
      );
  }
}
