import { describe, expect, it } from 'vitest';
import { buildDiscomDesk, type DiscomWait, waitedDays } from './discom-desk-build';

const msedcl = {
  id: 'd1',
  code: 'MSEDCL',
  name: 'MSEDCL',
  state: 'Maharashtra',
  expectedDays: 30,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const at = (date: string) => new Date(`${date}T06:00:00Z`);

function wait(patch: Partial<DiscomWait>): DiscomWait {
  return {
    kind: 'task',
    id: 't1',
    title: 'DISCOM inspection',
    subject: 'OH-2026-001 · Patil (test)',
    href: '/projects/p1',
    assignee: null,
    discomId: 'd1',
    since: null,
    until: null,
    earlier: [],
    finished: false,
    waitingNow: false,
    referenceNumber: null,
    office: null,
    nextFollowUpOn: null,
    note: null,
    ...patch,
  };
}

describe('waitedDays', () => {
  it('adds earlier waits to the current one, so a resume keeps the time', () => {
    const resumed = wait({
      earlier: [{ from: at('2026-10-01'), to: at('2026-10-05') }],
      since: at('2026-10-10'),
    });
    expect(waitedDays(resumed, '2026-10-13')).toBe(7);
  });

  it('counts only earlier waits for work that is not waiting now', () => {
    const resumed = wait({ earlier: [{ from: at('2026-10-01'), to: at('2026-10-06') }] });
    expect(waitedDays(resumed, '2026-11-01')).toBe(5);
  });
});

describe('buildDiscomDesk', () => {
  it('averages finished steps, and every wait per DISCOM office', () => {
    const desk = buildDiscomDesk(
      [
        wait({
          id: 'a',
          since: at('2026-10-01'),
          until: at('2026-10-11'),
          finished: true,
          office: 'Sangli Rural',
        }),
        wait({
          id: 'b',
          earlier: [{ from: at('2026-10-01'), to: at('2026-10-05') }],
          since: at('2026-10-08'),
          until: at('2026-10-10'),
          finished: true,
          office: 'sangli rural ',
        }),
        wait({ id: 'c', since: at('2026-10-20'), waitingNow: true, office: 'Miraj Urban' }),
      ],
      [msedcl],
      '2026-10-25',
      0,
    );
    expect(desk.stepAverages).toEqual([
      { discomCode: 'MSEDCL', step: 'DISCOM inspection', averageDays: 8, samples: 2 },
    ]);
    expect(desk.officeAverages).toEqual([
      { discomCode: 'MSEDCL', office: 'Sangli Rural', averageDays: 8, samples: 2 },
      { discomCode: 'MSEDCL', office: 'Miraj Urban', averageDays: 5, samples: 1 },
    ]);
    expect(desk.totals.waiting).toBe(1);
  });
});
