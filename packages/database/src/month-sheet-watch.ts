import { type MonthRow, monthRow, monthRowDiff } from '@oneohm/domain';
import { addDays, monthOf, monthRange, todayIn } from '@oneohm/shared';
import { and, eq, gte } from 'drizzle-orm';
import { businessTimeZone } from './business-calendar';
import type { DatabaseExecutor } from './client';
import { type MonthFacts, type MonthRefs, readMonthFacts } from './month-sheet-facts';
import { type MonthPerson, monthPeople } from './month-sheet-people';
import { notifyHolders } from './notify';
import { monthSheetRows, monthSheets } from './schema/month-sheets.schema';

export interface LiveMonth {
  readonly facts: MonthFacts;
  readonly people: readonly MonthPerson[];
  readonly rows: ReadonlyMap<string, MonthRow>;
  readonly refs: ReadonlyMap<string, MonthRefs>;
}

/**
 * The month as the facts say now, for these people (all staff of the month when not given),
 * leaving out anyone with no day of employment in it (gone before it, back after it).
 * `anyRole` reads the given people whatever they hold now.
 */
export async function liveMonth(
  db: DatabaseExecutor,
  month: string,
  today: string,
  ids?: readonly string[],
  options: { readonly anyRole?: boolean } = {},
): Promise<LiveMonth> {
  const found = await monthPeople(db, month, ids, options);
  const facts = await readMonthFacts(db, month, today, found);
  const { start, end } = monthRange(month);
  const rows = new Map<string, MonthRow>();
  for (const [id, person] of facts.people) {
    const employed = person.periods.some(
      (period) => period.from <= end && (period.to === null || period.to >= start),
    );
    if (employed) rows.set(id, monthRow(person, facts.rules));
  }
  const people = found.filter((person) => rows.has(person.id));
  return { facts, people, rows, refs: facts.refs };
}

/** "October 2026" for a `YYYY-MM` month. */
export const monthName = (month: string): string =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** What differs, as a short stable text: the same change gives the same text. */
const changeText = (locked: MonthRow, live: MonthRow) =>
  monthRowDiff(locked, live)
    .map((change) => `${change.field}:${change.before}>${change.after}`)
    .join(',');

/**
 * "Changed after lock" (Duty Day step 7, "Nothing goes silent"), once a day after the morning
 * jobs: for each locked month of the last three, every frozen row is compared with the facts
 * now on what salary is made of. HR (`people.manage`) is told once per change: the change told
 * is kept on the row, so the same change is not told again the next day. Returns rows told.
 */
export async function watchLockedMonths(
  db: DatabaseExecutor,
  now: Date = new Date(),
  timeZone: string = businessTimeZone(),
): Promise<number> {
  const today = todayIn(timeZone, now);
  const oldest = monthOf(new Date(`${addDays(`${today.slice(0, 7)}-01`, -62)}T12:00:00Z`));
  const sheets = await db
    .select({ id: monthSheets.id, month: monthSheets.month })
    .from(monthSheets)
    .where(and(eq(monthSheets.status, 'locked'), gte(monthSheets.month, oldest)));
  let told = 0;
  for (const sheet of sheets) {
    const frozen = await db
      .select({
        id: monthSheetRows.id,
        userId: monthSheetRows.userId,
        breakdown: monthSheetRows.breakdown,
        toldChange: monthSheetRows.toldChange,
      })
      .from(monthSheetRows)
      .where(eq(monthSheetRows.sheetId, sheet.id));
    if (frozen.length === 0) continue;
    const live = await liveMonth(
      db,
      sheet.month,
      today,
      frozen.map((row) => row.userId),
    );
    for (const row of frozen) {
      const current = live.rows.get(row.userId);
      const change = current ? changeText(row.breakdown, current) : '';
      if (change === '' || change === row.toldChange) continue;
      const name = live.people.find((person) => person.id === row.userId)?.fullName ?? 'Someone';
      await notifyHolders(db, 'people.manage', {
        kind: 'month_row_changed',
        title: `${name}: ${monthName(sheet.month)} changed after lock`,
        body: 'Attendance, leave or claims changed after the month was locked. Check the row, then refresh it or open the month again.',
        subject: { type: 'month_sheet', id: row.userId, month: sheet.month },
        dedupeKey: `month_row_changed:${sheet.month}:${row.userId}:${today}`,
      });
      await db
        .update(monthSheetRows)
        .set({ toldChange: change })
        .where(eq(monthSheetRows.id, row.id));
      told += 1;
    }
  }
  return told;
}
