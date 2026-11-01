import { reportBuckets } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { type DelayTaskRow, delayFact, stepDays } from './delays-report.read';
import { buildDelays } from './delays-report.service';

const range = { start: '2026-11-01', end: '2026-11-30' };
const scope = {
  today: '2026-11-20',
  meta: { range, granularity: 'week' as const, buckets: reportBuckets(range, 'week') },
};
/** 18:00 India time on a date, as an instant. */
const at = (date: string) => new Date(`${date}T18:00:00+05:30`);

let next = 0;
const task = (patch: Partial<DelayTaskRow>): DelayTaskRow => {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
    projectId: '00000000-0000-4000-8000-100000000001',
    projectCode: 'OH-2026-001',
    projectName: 'Patil (test)',
    discomId: '00000000-0000-4000-8000-200000000001',
    discomCode: 'MSEDCL',
    discomName: 'Maharashtra State Electricity Distribution Co. Ltd.',
    templateKey: 'site_survey',
    title: 'Site survey',
    stage: 'survey',
    status: 'pending',
    party: 'internal',
    startDate: '2026-11-01',
    dueDate: '2026-11-10',
    startedAt: null,
    waitingSince: null,
    completedAt: null,
    ...patch,
  };
};
const fact = (patch: Partial<DelayTaskRow>) => delayFact(task(patch), scope);

describe('delayFact', () => {
  it('counts a finished task from its due date to the India date it finished', () => {
    const late = fact({ status: 'completed', completedAt: at('2026-11-13') });
    expect(late).toMatchObject({ finished: true, open: false, daysLate: 3 });
    const early = fact({ status: 'completed', completedAt: at('2026-11-08') });
    expect(early.daysLate).toBe(0);
  });

  it('counts an open task to today, and its waiting days from when it started waiting', () => {
    const open = fact({ status: 'waiting', party: 'bank', waitingSince: at('2026-11-15') });
    expect(open).toMatchObject({ finished: false, open: true, daysLate: 10, waitingDays: 5 });
  });

  it('measures a DISCOM step from the day it started, else its planned start', () => {
    const started = fact({
      status: 'completed',
      startedAt: at('2026-11-04'),
      completedAt: at('2026-11-12'),
    });
    expect(stepDays(started)).toBe(8);
    expect(stepDays(fact({ status: 'completed', completedAt: at('2026-11-06') }))).toBe(5);
  });
});

describe('buildDelays', () => {
  const facts = [
    fact({ status: 'completed', completedAt: at('2026-11-13') }),
    fact({ status: 'completed', completedAt: at('2026-11-09') }),
    fact({
      status: 'completed',
      party: 'discom',
      templateKey: 'discom_sanction',
      title: 'MSEDCL sanction',
      stage: 'net_metering',
      dueDate: '2026-11-05',
      startedAt: at('2026-11-02'),
      completedAt: at('2026-11-12'),
    }),
    fact({ status: 'in_progress', party: 'customer', dueDate: '2026-11-18' }),
    fact({ status: 'pending', dueDate: '2026-11-25' }),
  ];
  const report = buildDelays(scope, facts);

  it('splits days late by cause, finished and still open apart', () => {
    expect(report.totals).toEqual({ finished: 3, finishedLate: 2, openLate: 1, waitingNow: 0 });
    const days = Object.fromEntries(report.byParty.map((row) => [row.party, row]));
    expect(days.internal).toMatchObject({ finishedLate: 1, finishedDays: 3, openDays: 0 });
    expect(days.discom).toMatchObject({ finishedLate: 1, finishedDays: 7 });
    expect(days.customer).toMatchObject({ openLate: 1, openDays: 2 });
    expect(days.bank).toMatchObject({ finishedLate: 0, openLate: 0 });
  });

  it('puts finished late days in the week they finished', () => {
    const week = report.byBucket.find((row) => row.start === '2026-11-09');
    expect(week?.days).toEqual({ internal: 3, customer: 0, bank: 0, discom: 7 });
    expect(week?.tasks.discom).toBe(1);
  });

  it('ranks steps by days lost and keeps DISCOM time per DISCOM', () => {
    expect(report.steps.map((row) => [row.templateKey, row.days, row.party])).toEqual([
      ['discom_sanction', 7, 'discom'],
      ['site_survey', 5, 'internal'],
    ]);
    expect(report.steps[1]).toMatchObject({ late: 2, open: 1, averageDays: 2.5 });
    expect(report.discoms).toEqual([
      expect.objectContaining({ finished: 1, late: 1, lateDays: 7, averageDays: 10 }),
    ]);
  });

  it('lists open work past due or waiting, longest first', () => {
    expect(report.waiting.map((row) => [row.party, row.daysLate])).toEqual([['customer', 2]]);
  });
});
