import { type Database, payables, paymentMilestones, payments } from '@oneohm/database';
import { addDays } from '@oneohm/shared';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';

export interface MoneyFigures {
  readonly collectedPaise: number;
  readonly duePaise: number;
  readonly weekly: number[];
  readonly stillDuePaise: number;
  readonly bankPendingPaise: number;
  readonly toVendorsPaise: number;
  readonly toContractorsPaise: number;
  readonly advancesPaise: number;
}

/** Collections this month and the last 8 weeks, what is still owed, and what goes out. */
export async function moneyFigures(db: Database, today: string): Promise<MoneyFigures> {
  const monthStart = `${today.slice(0, 8)}01`;
  const eightWeeksAgo = addDays(today, -55);
  const received = await db
    .select({ amount: payments.amountPaise, on: payments.receivedOn })
    .from(payments)
    .where(gte(payments.receivedOn, eightWeeksAgo));
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

  const weekEnd = addDays(today, 7);
  const outgoing = await db
    .select({
      party: payables.party,
      amount: payables.amountPaise,
      description: payables.description,
    })
    .from(payables)
    .where(and(ne(payables.status, 'paid'), lte(payables.dueOn, weekEnd)));
  const sumOf = (party: 'vendor' | 'contractor') =>
    outgoing.filter((row) => row.party === party).reduce((sum, row) => sum + row.amount, 0);
  return {
    collectedPaise,
    duePaise: collectedPaise + stillDuePaise,
    weekly,
    stillDuePaise,
    bankPendingPaise,
    toVendorsPaise: sumOf('vendor'),
    toContractorsPaise: sumOf('contractor'),
    advancesPaise: outgoing
      .filter((row) => row.description.toLowerCase().startsWith('advance'))
      .reduce((sum, row) => sum + row.amount, 0),
  };
}
