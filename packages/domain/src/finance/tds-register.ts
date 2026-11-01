import { ACCOUNT } from './ledger-accounts';
import type { JournalLine } from './ledger-postings';

/**
 * TDS held for the government, month by month (PRD 3.11). What OneOhm holds back on a
 * bill or a work order is owed to the government and deposited with a challan by the
 * 7th of the next month (30 April for March). Rates are in basis points (1% = 100).
 */

/**
 * Income-tax Act sections the TDS falls under: 194C for contract work (crews and
 * contractors), 194J for a vendor's services, 194Q for buying goods.
 */
export const TDS_SECTIONS = ['194C', '194J', '194Q'] as const;
export type TdsSection = (typeof TDS_SECTIONS)[number];

/** Where TDS was held: a settled work order, or a bill (from a goods receipt or added by hand). */
export type TdsSource = 'work_order' | 'receipt_bill' | 'bill';

/** The section for TDS held on one source. */
export function tdsSectionOf(input: {
  readonly source: TdsSource;
  readonly party: 'vendor' | 'contractor' | 'employee';
}): TdsSection {
  if (input.source === 'work_order' || input.party === 'contractor') return '194C';
  if (input.source === 'receipt_bill') return '194Q';
  return '194J';
}

/** "2026-10" for any day in October 2026. */
export function tdsMonthOf(date: string): string {
  return date.slice(0, 7);
}

/** The last day to deposit a month's TDS: the 7th of the next month, or 30 April for March. */
export function tdsDueOn(month: string): string {
  const [year, mm] = month.split('-').map(Number) as [number, number];
  if (mm === 3) return `${year}-04-30`;
  const nextYear = mm === 12 ? year + 1 : year;
  const nextMonth = mm === 12 ? 1 : mm + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-07`;
}

export interface TdsAmount {
  readonly month: string;
  readonly section: TdsSection;
  readonly amountPaise: number;
}

export type TdsMonthState = 'due' | 'overdue' | 'deposited';

export interface TdsMonthRow {
  readonly month: string;
  readonly section: TdsSection;
  readonly heldPaise: number;
  readonly depositedPaise: number;
  /** Still to deposit; never below zero. */
  readonly duePaise: number;
  readonly dueOn: string;
  readonly state: TdsMonthState;
}

const keyOf = (row: { month: string; section: string }) => `${row.month}|${row.section}`;

/**
 * One row per month and section: what was held, what was deposited, and what is still
 * due. Newest month first; within a month, in section order.
 */
export function tdsMonthRows(
  held: readonly TdsAmount[],
  deposits: readonly TdsAmount[],
  today: string,
): TdsMonthRow[] {
  const sums = new Map<
    string,
    { month: string; section: TdsSection; held: number; paid: number }
  >();
  const add = (row: TdsAmount, field: 'held' | 'paid') => {
    const key = keyOf(row);
    const sum = sums.get(key) ?? { month: row.month, section: row.section, held: 0, paid: 0 };
    sum[field] += Math.max(0, row.amountPaise);
    sums.set(key, sum);
  };
  for (const row of held) add(row, 'held');
  for (const row of deposits) add(row, 'paid');
  return [...sums.values()]
    .map((sum) => {
      const duePaise = Math.max(0, sum.held - sum.paid);
      const dueOn = tdsDueOn(sum.month);
      const state: TdsMonthState = duePaise === 0 ? 'deposited' : today > dueOn ? 'overdue' : 'due';
      return {
        month: sum.month,
        section: sum.section,
        heldPaise: sum.held,
        depositedPaise: sum.paid,
        duePaise,
        dueOn,
        state,
      };
    })
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        TDS_SECTIONS.indexOf(a.section) - TDS_SECTIONS.indexOf(b.section),
    );
}

export type TdsDepositProblem = 'nothing_due' | 'before_month' | 'in_future';

/**
 * Checks a deposit before it is booked: there must be TDS due for the month and section,
 * and the challan date falls after the month started and not after today.
 */
export function tdsDepositProblem(input: {
  readonly month: string;
  readonly duePaise: number;
  readonly depositedOn: string;
  readonly today: string;
}): TdsDepositProblem | null {
  if (input.duePaise <= 0) return 'nothing_due';
  if (input.depositedOn > input.today) return 'in_future';
  if (input.depositedOn < `${input.month}-01`) return 'before_month';
  return null;
}

/** TDS deposited with the government: what was owed to it goes, and so does the bank money. */
export function tdsDepositPosting(input: { readonly amountPaise: number }): JournalLine[] {
  return [
    { account: ACCOUNT.tdsPayable, debitPaise: input.amountPaise, creditPaise: 0 },
    { account: ACCOUNT.bank, debitPaise: 0, creditPaise: input.amountPaise },
  ];
}

/** A rate to use: the one given, else the profile's own, else the company default. */
export function tdsRateFor(...choices: readonly (number | null | undefined)[]): number {
  for (const choice of choices) if (choice !== null && choice !== undefined) return choice;
  return 0;
}
