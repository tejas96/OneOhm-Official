import {
  type Database,
  journalEntries,
  journalLines,
  payables,
  paymentMilestones,
  payments,
  workOrderAdvances,
} from '@oneohm/database';
import { ACCOUNT } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

export interface MoneyFigures {
  readonly revenuePaise: number;
  readonly collectedPaise: number;
  readonly duePaise: number;
  readonly weekly: number[];
  readonly stillDuePaise: number;
  readonly bankPendingPaise: number;
  readonly toVendorsPaise: number;
  readonly toContractorsPaise: number;
  readonly dueThisWeekPaise: number;
  readonly advancesPaise: number;
}

/** Collections in the period and the last 8 weeks, what is still owed, and what goes out. */
export async function moneyFigures(
  db: Database,
  today: string,
  periodStart = `${today.slice(0, 8)}01`,
): Promise<MoneyFigures> {
  const monthStart = periodStart;
  const eightWeeksAgo = addDays(today, -55);
  const received = await db
    .select({ amount: payments.amountPaise, on: payments.receivedOn })
    .from(payments)
    .where(gte(payments.receivedOn, monthStart < eightWeeksAgo ? monthStart : eightWeeksAgo));
  const collectedPaise = received
    .filter((payment) => payment.on >= monthStart)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const weekly = Array.from({ length: 8 }, (_, index) => {
    const from = addDays(eightWeeksAgo, index * 7);
    const to = addDays(from, 6);
    return received
      .filter((payment) => payment.on >= from && payment.on <= to)
      .reduce((sum, payment) => sum + payment.amount, 0);
  });

  const open = await db
    .select({
      id: paymentMilestones.id,
      payer: paymentMilestones.payer,
      amount: paymentMilestones.amountPaise,
      status: paymentMilestones.status,
    })
    .from(paymentMilestones)
    .where(ne(paymentMilestones.status, 'upcoming'));
  const openIds = open
    .filter((milestone) => milestone.status !== 'paid')
    .map((milestone) => milestone.id);
  const paidOnOpen = openIds.length
    ? await db
        .select({ milestoneId: payments.milestoneId, amount: payments.amountPaise })
        .from(payments)
        .where(inArray(payments.milestoneId, openIds))
    : [];
  const outstanding = (payer: 'customer' | 'bank') =>
    open
      .filter((milestone) => milestone.status !== 'paid' && milestone.payer === payer)
      .reduce(
        (sum, milestone) =>
          sum +
          milestone.amount -
          paidOnOpen
            .filter((paid) => paid.milestoneId === milestone.id)
            .reduce((acc, paid) => acc + paid.amount, 0),
        0,
      );
  const stillDuePaise = outstanding('customer');
  const bankMilestones = await db
    .select({ id: paymentMilestones.id, amount: paymentMilestones.amountPaise })
    .from(paymentMilestones)
    .where(and(eq(paymentMilestones.payer, 'bank'), ne(paymentMilestones.status, 'paid')));
  const bankPaid = bankMilestones.length
    ? await db
        .select({ amount: payments.amountPaise })
        .from(payments)
        .where(
          inArray(
            payments.milestoneId,
            bankMilestones.map((row) => row.id),
          ),
        )
    : [];
  const bankPendingPaise =
    bankMilestones.reduce((sum, row) => sum + row.amount, 0) -
    bankPaid.reduce((sum, row) => sum + row.amount, 0);

  return {
    revenuePaise: await revenueBooked(db, monthStart, today),
    collectedPaise,
    duePaise: collectedPaise + stillDuePaise,
    weekly,
    stillDuePaise,
    bankPendingPaise,
    ...(await goingOut(db, today)),
  };
}

/** Project revenue the ledger booked in the period: credits less debits on account 4000. */
async function revenueBooked(db: Database, from: string, to: string): Promise<number> {
  const [row] = await db
    .select({
      net: sql<number>`coalesce(sum(${journalLines.creditPaise} - ${journalLines.debitPaise}), 0)::float8`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.accountCode, ACCOUNT.revenue),
        gte(journalEntries.entryDate, from),
        lte(journalEntries.entryDate, to),
      ),
    );
  return Math.round(row?.net ?? 0);
}

/**
 * Everything still owed on vendor and contractor bills, what of it falls due within a
 * week, and crew advances found by their work-order link rather than their wording.
 */
async function goingOut(db: Database, today: string) {
  const weekEnd = addDays(today, 7);
  const outgoing = await db
    .select({
      party: payables.party,
      // What is left to pay once any vendor advance is set against the bill.
      amount: sql<number>`(${payables.amountPaise} - ${payables.advanceAdjustedPaise})::float8`,
      dueOn: payables.dueOn,
      advance: workOrderAdvances.id,
    })
    .from(payables)
    .leftJoin(workOrderAdvances, eq(workOrderAdvances.payableId, payables.id))
    .where(ne(payables.status, 'paid'));
  const total = (rows: typeof outgoing) => rows.reduce((sum, row) => sum + row.amount, 0);
  return {
    toVendorsPaise: total(outgoing.filter((row) => row.party === 'vendor')),
    toContractorsPaise: total(outgoing.filter((row) => row.party === 'contractor')),
    dueThisWeekPaise: total(
      outgoing.filter((row) => row.party !== 'employee' && row.dueOn <= weekEnd),
    ),
    advancesPaise: total(outgoing.filter((row) => row.advance !== null)),
  };
}
