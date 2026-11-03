import type { CustomerAfterSales } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { coverLength, coverText } from './cover-answer';
import { plainDate } from './plain-date';

const after: CustomerAfterSales = {
  projects: [
    {
      projectId: 'p1',
      projectCode: 'OH-2026-005',
      commissionedOn: '2026-09-22',
      assets: [
        {
          kind: 'panel',
          make: 'Waaree',
          model: 'WS-540',
          quantity: 12,
          warrantyStartsOn: '2026-09-22',
          warrantyEndsOn: '2051-09-21',
          performanceEndsOn: '2056-09-21',
          warrantyState: 'active',
        },
        {
          kind: 'workmanship',
          make: null,
          model: 'Installation',
          quantity: 1,
          warrantyStartsOn: '2020-01-01',
          warrantyEndsOn: '2024-12-31',
          performanceEndsOn: null,
          warrantyState: 'ended',
        },
      ],
      amc: {
        planName: 'Clean and check',
        startsOn: '2026-09-22',
        endsOn: '2027-09-21',
        includes: ['Panel cleaning'],
        visitsTotal: 4,
        visitsDone: 1,
        state: 'active',
      },
    },
    {
      projectId: 'p2',
      projectCode: 'OH-2026-007',
      commissionedOn: null,
      assets: [],
      amc: null,
    },
  ],
  upcomingVisits: [
    {
      id: 'v1',
      projectCode: 'OH-2026-005',
      dueOn: '2027-01-12',
      visitName: 'cleaning',
      planName: 'Clean and check',
      status: null,
    },
  ],
};

describe('warranty and AMC answer', () => {
  it('writes dates the Indian way', () => {
    expect(plainDate('2026-11-04')).toBe('4 November 2026');
  });

  it('counts the warranty in years, or months when shorter', () => {
    expect(coverLength('2026-09-22', '2051-09-21')).toBe('25 years');
    expect(coverLength('2026-01-01', '2026-12-31')).toBe('1 year');
    expect(coverLength('2026-01-01', '2026-06-30')).toBe('6 months');
  });

  // Live review C9: the chat names each home by its town; codes stay in the PDFs.
  const places = new Map([
    ['p1', 'Sangli'],
    ['p2', 'Pune'],
  ]);

  it('lists each item with its years and end date, then the AMC and next visit', () => {
    const text = coverText(after, places);
    expect(text).toContain('*Your solar project in Sangli*');
    expect(text).not.toContain('OH-2026');
    expect(text).toContain('Switched on 22 September 2026.');
    expect(text).toContain(
      '• Solar panels (12 × Waaree WS-540): 25 years, until 21 September 2051',
    );
    expect(text).toContain('Power output guaranteed until 21 September 2056');
    expect(text).toContain(
      '• Installation work (Installation): warranty ended on 31 December 2024',
    );
    expect(text).toContain('AMC: Clean and check (active), 22 September 2026 to 21 September 2027');
    expect(text).toContain('1 of 4 visits done');
    expect(text).toContain('Next cleaning visit: 12 January 2027');
  });

  it('says when cover starts for a home not switched on yet', () => {
    const text = coverText(after, places);
    expect(text).toMatch(/\*Your solar project in Pune\*\nYour warranties start on the day/);
    expect(coverText({ projects: [], upcomingVisits: [] }, places)).toMatch(
      /do not have a project/,
    );
    const waiting = { projects: after.projects.slice(1), upcomingVisits: [] };
    expect(coverText(waiting, places)).not.toContain('Report a problem');
  });
});
