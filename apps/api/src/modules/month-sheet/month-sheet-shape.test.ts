import { monthRow } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { sheetRow } from './month-sheet-shape';

const rules = {
  month: '2026-10',
  today: '2026-11-16',
  weeklyOff: [0],
  holidays: new Map<string, string>(),
  halfDayHours: 4,
  offsNeedWorkInWeek: false,
  lateEvery: 0,
  leaveKinds: new Map(),
};
const facts = {
  userId: 'u1',
  periods: [{ from: '2026-01-01', to: null }],
  monthlyPayPaise: 3_100_000,
  attendance: [],
  leaves: [],
  openCorrections: [],
  claims: [],
  bonuses: [],
  doubtfulVisits: [],
  openAlerts: [],
};
const person = {
  id: 'u1',
  fullName: 'Ravi',
  employeeCode: null,
  phone: null,
  designation: null,
  avatarSwatch: 0,
  addedOn: '2026-01-01',
  leftOn: null,
  reportsTo: null,
};
const live = monthRow(facts, rules);

describe('sheetRow', () => {
  it('hides monthly pay and gross from a manager, and gross from their changes', () => {
    const frozen = {
      breakdown: monthRow({ ...facts, monthlyPayPaise: 3_000_000 }, rules),
      frozenAt: new Date(),
    };
    const row = sheetRow({ person, live, frozen, showsPay: false, locked: true });
    expect(row.money).toMatchObject({ monthlyPayPaise: null, grossPaise: null });
    expect(row.changes.map((change) => change.field)).not.toContain('grossPaise');
  });

  it('marks someone who qualifies after the lock as not in the locked sheet', () => {
    expect(sheetRow({ person, live, frozen: null, showsPay: true, locked: true }).inLock).toBe(
      false,
    );
    expect(sheetRow({ person, live, frozen: null, showsPay: true, locked: false }).inLock).toBe(
      true,
    );
  });

  it('keeps a frozen row with no live numbers (lost their role) from the frozen breakdown', () => {
    const frozen = { breakdown: live, frozenAt: new Date() };
    const row = sheetRow({ person, live: null, frozen, showsPay: true, locked: true });
    expect(row).toMatchObject({ inLock: true, changes: [] });
    expect(row.counts.payableDays).toBe(live.counts.payableDays);
  });
});
