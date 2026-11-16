import type { MonthSheet, MonthSheetPerson, MonthSheetRow } from '@oneohm/api-contracts';
import type { MonthPerson, MonthRefs } from '@oneohm/database';
import {
  isAmber,
  type MonthPersonFacts,
  type MonthRow,
  type MonthRules,
  monthRowDiff,
} from '@oneohm/domain';

/** A row frozen at lock (or refresh), when the month is locked. */
export interface Frozen {
  readonly breakdown: MonthRow;
  readonly frozenAt: Date;
}

const personRef = (person: MonthPerson) => ({
  id: person.id,
  fullName: person.fullName,
  employeeCode: person.employeeCode,
  phone: person.phone,
  designation: person.designation,
  avatarSwatch: person.avatarSwatch,
  reportsTo: person.reportsTo,
});

/**
 * One sheet row. Locked, the numbers are the frozen ones and `changes` lists what the facts
 * say now on what salary is made of; open, the numbers are the facts now. Flags are today's
 * (a fixed problem leaves the row); a frozen person no longer on the sheet keeps the frozen
 * flags. Someone who qualifies now but is not in the locked sheet shows live, `inLock` false.
 * Without pay rights, monthly pay and gross are null. Managers do see travel and bonus
 * amounts: they approve their team's claims, so those figures are already theirs to see.
 */
export function sheetRow(input: {
  readonly person: MonthPerson;
  readonly live: MonthRow | null;
  readonly frozen: Frozen | null;
  readonly showsPay: boolean;
  readonly locked: boolean;
}): MonthSheetRow {
  const { live, frozen, showsPay } = input;
  const shown = frozen?.breakdown ?? live;
  if (!shown) throw new Error('A sheet row needs live or frozen numbers.');
  const money = showsPay
    ? shown.money
    : { ...shown.money, monthlyPayPaise: null, grossPaise: null };
  const changes = frozen && live ? monthRowDiff(frozen.breakdown, live) : [];
  const flagged = live ?? shown;
  return {
    person: personRef(input.person),
    counts: shown.counts,
    money,
    flags: flagged.flags.map((flag) => ({ kind: flag.kind, days: [...flag.days] })),
    amber: isAmber(flagged),
    frozenAt: frozen?.frozenAt.toISOString() ?? null,
    inLock: !input.locked || frozen !== null,
    changes: showsPay ? changes : changes.filter((change) => change.field !== 'grossPaise'),
  };
}

/** Amber rows first, then rows not in the lock, then rows changed after lock, then by name. */
export function sortRows(rows: MonthSheetRow[]): MonthSheetRow[] {
  return rows.sort(
    (a, b) =>
      Number(b.amber) - Number(a.amber) ||
      Number(!b.inLock) - Number(!a.inLock) ||
      Number(b.changes.length > 0) - Number(a.changes.length > 0) ||
      a.person.fullName.localeCompare(b.person.fullName),
  );
}

const sum = (rows: readonly MonthSheetRow[], pick: (row: MonthSheetRow) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

export function summaryOf(
  rows: readonly MonthSheetRow[],
  showsPay: boolean,
): MonthSheet['summary'] {
  return {
    people: rows.length,
    payableDays: sum(rows, (row) => row.counts.payableDays),
    grossPaise: showsPay ? sum(rows, (row) => row.money.grossPaise ?? 0) : null,
    travelApprovedPaise: sum(rows, (row) => row.money.travelApprovedPaise),
    travelPaidPaise: sum(rows, (row) => row.money.travelPaidPaise),
    bonusPaise: sum(rows, (row) => row.money.bonusPaise),
    amberRows: rows.filter((row) => row.amber).length,
    changedRows: rows.filter((row) => row.changes.length > 0).length,
    notInLockRows: rows.filter((row) => !row.inLock).length,
  };
}

export const rulesOut = (rules: MonthRules) => ({
  halfDayHours: rules.halfDayHours,
  lateEvery: rules.lateEvery,
  offsNeedWorkInWeek: rules.offsNeedWorkInWeek,
});

/** The records behind one person's numbers. */
export function itemsOf(
  facts: MonthPersonFacts,
  refs: MonthRefs | undefined,
  rules: MonthRules,
): MonthSheetPerson['items'] {
  return {
    leaves: (refs?.leaves ?? []).map((leave) => {
      const kind = rules.leaveKinds.get(leave.leaveType);
      return {
        id: leave.id,
        label: kind?.label ?? leave.leaveType,
        fromDate: leave.fromDate,
        toDate: leave.toDate,
        halfDay: leave.halfDay,
        paid: leave.paid ?? kind?.paid ?? true,
        status: leave.status,
      };
    }),
    corrections: refs?.corrections ?? [],
    claims: facts.claims.map((claim) => ({ ...claim })),
    bonuses: facts.bonuses.map((bonus) => ({ ...bonus })),
    alerts: refs?.alerts ?? [],
  };
}
