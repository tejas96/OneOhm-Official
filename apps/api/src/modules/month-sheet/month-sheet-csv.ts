import type { MonthSheet } from '@oneohm/api-contracts';
import type { MonthFlagKind } from '@oneohm/domain';
import { type CsvTable, rupees } from '../business-reports/csv';

export type { CsvTable };

const FLAG_WORDS: Readonly<Record<MonthFlagKind, string>> = {
  auto_closed: 'Day ended by the system',
  delayed_tap: 'Late tap accepted',
  open_correction: 'Correction waiting',
  pending_leave: 'Leave waiting',
  pending_travel: 'Travel claim waiting',
  doubtful_visit: 'Doubtful visit',
  open_alert: 'Open alert',
  absent_no_reason: 'Absent, no reason',
};

/** "6 Oct, 12 Oct" for the days of a flag. */
const dayList = (days: readonly string[]) =>
  days
    .map((day) =>
      new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${day}T00:00:00Z`),
      ),
    )
    .join(', ');

/**
 * A phone Excel keeps as text: "98765 43210" for an Indian mobile, else the digits in groups.
 * A leading "+" would read as a formula (and be quoted with an apostrophe), so it is left out.
 */
export function phoneCell(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91'))
    return `${digits.slice(2, 7)} ${digits.slice(7)}`;
  return digits.replace(/(\d{1,4})(?=(\d{4})+$)/g, '$1 ');
}

/**
 * The sheet as a spreadsheet (Duty Day step 7): one row per person with every column the
 * table shows, plus employee id and phone. Monthly pay and gross only for HR and finance;
 * a manager's file has no pay columns at all.
 */
export function monthCsv(sheet: MonthSheet): CsvTable {
  const pay = sheet.showsPay;
  const headers = [
    'Employee ID',
    'Name',
    'Phone',
    'Designation',
    'Reports to',
    'Month',
    'Sheet',
    'Days in month',
    'Working days',
    'Present',
    'Half days',
    'Absent',
    'Paid leave',
    'Unpaid leave',
    'Holidays',
    'Weekly offs',
    'Offs not paid',
    'Days not employed',
    'Late marks',
    'Late deduction (days)',
    'Payable days',
    ...(pay ? ['Monthly pay (₹)', 'Gross pay (₹)'] : []),
    'Travel approved (₹)',
    'Travel paid (₹)',
    'Travel waiting (₹)',
    'Bonus (₹)',
    'Check',
    'Changed after lock',
  ];
  const rows = sheet.rows.map((row) => {
    const { counts, money, person } = row;
    return [
      person.employeeCode,
      person.fullName,
      phoneCell(person.phone),
      person.designation,
      person.reportsTo?.fullName ?? null,
      sheet.month,
      sheet.status === 'locked' ? 'Final' : 'Open',
      counts.daysInMonth,
      counts.workingDays,
      counts.present,
      counts.halfDays,
      counts.absent,
      counts.paidLeave,
      counts.unpaidLeave,
      counts.holidays,
      counts.weeklyOffs,
      counts.unpaidOffs,
      counts.notEmployed,
      counts.lates,
      counts.lateDeduction,
      counts.payableDays,
      ...(pay
        ? [
            money.monthlyPayPaise === null ? null : rupees(money.monthlyPayPaise),
            money.grossPaise === null ? null : rupees(money.grossPaise),
          ]
        : []),
      rupees(money.travelApprovedPaise),
      rupees(money.travelPaidPaise),
      rupees(money.travelPendingPaise),
      rupees(money.bonusPaise),
      row.flags.map((flag) => `${FLAG_WORDS[flag.kind]}: ${dayList(flag.days)}`).join('; ') || null,
      row.inLock ? (row.changes.length > 0 ? 'Yes' : 'No') : 'Not in the locked sheet',
    ];
  });
  return { fileName: `month-sheet-${sheet.month}`, headers, rows };
}
