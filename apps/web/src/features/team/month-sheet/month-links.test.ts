import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { dayHref, fixLinks } from './month-links';

const items: MonthSheetPerson['items'] = {
  leaves: [
    {
      id: 'l1',
      label: 'Casual',
      fromDate: '2026-10-05',
      toDate: '2026-10-06',
      halfDay: false,
      paid: true,
      status: 'pending',
    },
    {
      id: 'l2',
      label: 'Sick',
      fromDate: '2026-10-08',
      toDate: '2026-10-08',
      halfDay: false,
      paid: true,
      status: 'approved',
    },
  ],
  corrections: [{ id: 'c1', workDate: '2026-10-09' }],
  claims: [
    { id: 'k1', workDate: '2026-10-10', amountPaise: 5000, status: 'pending', paid: false },
    { id: 'k2', workDate: '2026-10-11', amountPaise: 5000, status: 'approved', paid: true },
  ],
  bonuses: [],
  alerts: [{ id: 'a1', day: '2026-10-12', title: 'Route gap' }],
};

describe('fixLinks', () => {
  it('opens the day on the live map for day problems', () => {
    expect(fixLinks('auto_closed', ['2026-10-03'], 'u1', items)[0]?.href).toBe(
      '/live?day=u1&date=2026-10-03',
    );
    expect(dayHref('u1', '2026-10-03')).toBe('/live?day=u1&date=2026-10-03');
  });
  it('opens the waiting correction, leave and claim themselves', () => {
    expect(fixLinks('open_correction', [], 'u1', items).map((l) => l.href)).toEqual([
      '/team?tab=attendance&correction=c1',
    ]);
    expect(fixLinks('pending_leave', [], 'u1', items).map((l) => l.href)).toEqual([
      '/team?tab=leave&leave=l1',
    ]);
    expect(fixLinks('pending_travel', [], 'u1', items).map((l) => l.href)).toEqual([
      '/team?tab=travel&claim=k1',
    ]);
  });
  it('opens the alert, or the day when no alert is listed', () => {
    expect(fixLinks('open_alert', ['2026-10-12'], 'u1', items)[0]?.href).toBe(
      '/live?tab=alerts&alert=a1',
    );
    expect(fixLinks('open_alert', ['2026-10-12'], 'u1', { ...items, alerts: [] })[0]?.href).toBe(
      '/live?day=u1&date=2026-10-12',
    );
  });
});
