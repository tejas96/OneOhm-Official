import { Inject, Injectable } from '@nestjs/common';
import type { MonthSheet, MonthSheetPerson } from '@oneohm/api-contracts';
import { liveMonth, monthPeople } from '@oneohm/database';
import { monthRange, todayIn } from '@oneohm/shared';
import type { Actor } from '../../common/auth/actor';
import { loadCalendar } from '../../common/calendar';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { assertMaySeePerson, type SheetAccess, sheetAccess } from './month-sheet-access';
import { lockableOn, lockMonth, refreshRow, unlockMonth } from './month-sheet-actions';
import { type CsvTable, monthCsv } from './month-sheet-csv';
import { itemsOf, rulesOut, sheetRow, sortRows, summaryOf } from './month-sheet-shape';
import { frozenRows, lockOut, readSheet } from './month-sheet-store';

const NO_ITEMS = { leaves: [], corrections: [], claims: [], bonuses: [], alerts: [] };

/**
 * The month sheet for salary (Duty Day step 7). Open months are built from the facts on
 * every read, so a closed day, an approved leave or a paid claim shows at once; a locked
 * month shows its frozen rows and what changed since.
 */
@Injectable()
export class MonthSheetService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async today(): Promise<string> {
    return todayIn((await loadCalendar(this.db)).timeZone);
  }

  async sheet(actor: Actor, month: string): Promise<MonthSheet> {
    return this.build(await sheetAccess(this.db, actor), month);
  }

  async csv(actor: Actor, month: string): Promise<CsvTable> {
    const access = await sheetAccess(this.db, actor);
    return monthCsv(await this.build(access, month));
  }

  private async build(access: SheetAccess, month: string): Promise<MonthSheet> {
    const today = await this.today();
    const sheet = await readSheet(this.db, month);
    const locked = sheet.status === 'locked';
    const [live, frozen] = await Promise.all([
      liveMonth(this.db, month, today, access.ids),
      frozenRows(this.db, sheet, access.ids),
    ]);
    // A locked sheet keeps everyone frozen in it, even someone who lost their role since.
    const gone = [...frozen.keys()].filter((id) => !live.rows.has(id));
    const kept = gone.length
      ? await liveMonth(this.db, month, today, gone, { anyRole: true })
      : null;
    const keptPeople = gone.length
      ? await monthPeople(this.db, month, gone, { anyRole: true })
      : [];
    const showsPay = access.showsPay;
    const rows = sortRows([
      ...live.people.map((person) =>
        sheetRow({
          person,
          live: live.rows.get(person.id) ?? null,
          frozen: frozen.get(person.id) ?? null,
          showsPay,
          locked,
        }),
      ),
      ...keptPeople.map((person) =>
        sheetRow({
          person,
          live: kept?.rows.get(person.id) ?? null,
          frozen: frozen.get(person.id) ?? null,
          showsPay,
          locked,
        }),
      ),
    ]);
    const end = monthRange(month).end;
    return {
      ...(await lockOut(this.db, sheet)),
      today,
      daysInMonth: Number(end.slice(8)),
      countedTo: today < end ? today : end,
      scope: access.scope,
      showsPay: access.showsPay,
      canManage: access.canManage,
      lockable: today >= lockableOn(month),
      rules: rulesOut(live.facts.rules),
      summary: summaryOf(rows, access.showsPay),
      rows,
    };
  }

  async person(actor: Actor, userId: string, month: string): Promise<MonthSheetPerson> {
    const access = await assertMaySeePerson(this.db, actor, userId);
    return this.personMonth(access, userId, month);
  }

  /** The worker's own month: the same numbers, with their own pay. */
  mine(actor: Actor, month: string): Promise<MonthSheetPerson> {
    const access: SheetAccess = {
      scope: 'reports',
      ids: [actor.userId],
      showsPay: true,
      canManage: false,
    };
    return this.personMonth(access, actor.userId, month);
  }

  private async personMonth(
    access: SheetAccess,
    userId: string,
    month: string,
  ): Promise<MonthSheetPerson> {
    const today = await this.today();
    const sheet = await readSheet(this.db, month);
    const frozen = (await frozenRows(this.db, sheet, [userId])).get(userId) ?? null;
    let live = await liveMonth(this.db, month, today, [userId]);
    // Someone frozen in a locked sheet stays readable after losing their role.
    if (!live.rows.has(userId) && frozen)
      live = await liveMonth(this.db, month, today, [userId], { anyRole: true });
    const person =
      live.people[0] ??
      (frozen ? (await monthPeople(this.db, month, [userId], { anyRole: true }))[0] : undefined);
    const row = live.rows.get(userId) ?? null;
    const facts = live.facts.people.get(userId);
    if (!person || !(row ?? frozen)) throw notFound('A month sheet for that person');
    return {
      lock: await lockOut(this.db, sheet),
      today,
      showsPay: access.showsPay,
      canManage: access.canManage,
      rules: rulesOut(live.facts.rules),
      row: sheetRow({
        person,
        live: row,
        frozen,
        showsPay: access.showsPay,
        locked: sheet.status === 'locked',
      }),
      days: [...((row ?? frozen?.breakdown)?.days ?? [])],
      items: facts ? itemsOf(facts, live.refs.get(userId), live.facts.rules) : NO_ITEMS,
    };
  }

  async lock(actor: Actor, month: string): Promise<MonthSheet> {
    await lockMonth(this.db, actor, month, await this.today());
    return this.sheet(actor, month);
  }

  async unlock(actor: Actor, month: string, reason: string): Promise<MonthSheet> {
    await unlockMonth(this.db, actor, month, reason);
    return this.sheet(actor, month);
  }

  async refresh(actor: Actor, month: string, userId: string): Promise<MonthSheetPerson> {
    await refreshRow(this.db, actor, month, userId, await this.today());
    return this.person(actor, userId, month);
  }
}
