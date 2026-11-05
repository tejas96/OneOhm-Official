import { Inject, Injectable } from '@nestjs/common';
import type { FinanceOverview } from '@oneohm/api-contracts';
import { payablePayments, payables, payments, vendorAdvances } from '@oneohm/database';
import { ACCOUNT, AGEING_BUCKETS, leftToPay } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { accountBalances } from './ledger-read.service';
import { ReceivablesService } from './receivables.service';

const MONTHS = 6;

/** Six calendar months ending with this one, as YYYY-MM, oldest first. */
function lastMonths(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: MONTHS }, (_, index) => {
    const date = new Date(Date.UTC(year, month - (MONTHS - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

/** The finance page's first screen: cash, who owes what and for how long, bills due. */
@Injectable()
export class FinanceOverviewService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly receivables: ReceivablesService,
  ) {}

  async get(): Promise<FinanceOverview> {
    const today = todayIn();
    const months = lastMonths(today);
    const from = `${months[0]}-01`;
    const balances = await accountBalances(this.db, [
      ACCOUNT.bank,
      ACCOUNT.cash,
      ACCOUNT.gateway,
      ACCOUNT.advancesReceived,
    ]);
    const owed = await this.receivables.list();
    const ageing = Object.fromEntries(AGEING_BUCKETS.map((bucket) => [bucket, 0])) as Record<
      (typeof AGEING_BUCKETS)[number],
      number
    >;
    for (const receivable of owed) {
      if (receivable.bucket) ageing[receivable.bucket] += receivable.outstandingPaise;
    }
    const sumOf = (filter: (item: (typeof owed)[number]) => boolean) =>
      owed.filter(filter).reduce((sum, item) => sum + item.outstandingPaise, 0);

    const bills = await this.db.select().from(payables).where(ne(payables.status, 'paid'));
    const weekEnd = addDays(today, 7);
    const billSum = (filter: (bill: (typeof bills)[number]) => boolean) =>
      bills.filter(filter).reduce((sum, bill) => sum + leftToPay(bill), 0);

    const received = await this.db
      // TDS a customer deducted settles the milestone but is not money in.
      .select({
        on: payments.receivedOn,
        amount: sql<number>`(${payments.amountPaise} - ${payments.tdsPaise})::float8`,
      })
      .from(payments)
      .where(gte(payments.receivedOn, from));
    // Money out: each payment made on a bill (all of it or a part; reversed ones, such as a
    // bank transfer that came back, do not count) and the vendor advances themselves.
    const billsPaid = await this.db
      .select({
        on: payablePayments.paidOn,
        amount: sql<number>`${payablePayments.amountPaise}::float8`,
      })
      .from(payablePayments)
      .where(and(isNull(payablePayments.reversedAt), gte(payablePayments.paidOn, from)));
    const advancesPaid = await this.db
      .select({ on: vendorAdvances.paidOn, amount: vendorAdvances.amountPaise })
      .from(vendorAdvances)
      .where(and(eq(vendorAdvances.status, 'paid'), gte(vendorAdvances.paidOn, from)));
    const paidOut = [...billsPaid, ...advancesPaid];

    return {
      balances: {
        bankPaise: balances.get(ACCOUNT.bank) ?? 0,
        cashPaise: balances.get(ACCOUNT.cash) ?? 0,
        gatewayPaise: balances.get(ACCOUNT.gateway) ?? 0,
      },
      receivables: {
        customerPaise: sumOf((item) => item.nextAction === 'collect_from_customer'),
        bankPaise: sumOf((item) => item.nextAction === 'claim_from_bank'),
        advancesPaise: -(balances.get(ACCOUNT.advancesReceived) ?? 0),
        notDueYetPaise: sumOf((item) => item.nextAction === 'not_due_yet'),
        ageing,
      },
      payables: {
        awaitingApprovalPaise: billSum((bill) => bill.status === 'pending'),
        awaitingApprovalCount: bills.filter((bill) => bill.status === 'pending').length,
        approvedUnpaidPaise: billSum((bill) => bill.status === 'approved'),
        dueThisWeekPaise: billSum((bill) => bill.dueOn >= today && bill.dueOn <= weekEnd),
        overduePaise: billSum((bill) => bill.dueOn < today),
      },
      monthly: months.map((month) => ({
        month,
        inPaise: received
          .filter((row) => row.on.startsWith(month))
          .reduce((sum, row) => sum + row.amount, 0),
        outPaise: paidOut
          .filter((row) => row.on?.startsWith(month))
          .reduce((sum, row) => sum + Number(row.amount), 0),
      })),
    };
  }
}
