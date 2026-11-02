import { describe, expect, it } from 'vitest';
import { judgeTask, type TaskPointFacts } from './task-points';

/** A wait from midnight IST on `from` to midnight IST on `to`: whole days. */
const wait = (party: string, from: string, to: string) => ({
  party,
  from: `${from}T00:00:00+05:30`,
  to: `${to}T00:00:00+05:30`,
});

const facts = (partial: Partial<TaskPointFacts>): TaskPointFacts => ({
  dueDate: '2026-11-01',
  startDate: '2026-10-25',
  handedInOn: '2026-11-01',
  selfMoves: [],
  outsideWaits: [],
  leave: [],
  needsApproval: false,
  returns: 0,
  ...partial,
});

describe('judgeTask: on time', () => {
  it('on time when handed in by the due date', () => {
    const { onTime } = judgeTask(facts({}));
    expect(onTime).toMatchObject({ earned: true, reason: 'On time', daysLate: 0 });
  });

  it('adds outside waits to the due date and says so', () => {
    const { onTime } = judgeTask(
      facts({
        handedInOn: '2026-11-04',
        outsideWaits: [wait('bank', '2026-10-28', '2026-11-02')],
      }),
    );
    expect(onTime.earned).toBe(true);
    expect(onTime.reason).toBe('On time (after 5 days waiting on the bank)');
    expect(onTime.judgedDue).toBe('2026-11-06');
  });

  it('does not add internal waits', () => {
    const { onTime } = judgeTask(
      facts({
        handedInOn: '2026-11-04',
        outsideWaits: [wait('internal', '2026-10-28', '2026-11-02')],
      }),
    );
    expect(onTime).toMatchObject({
      earned: false,
      daysLate: 3,
      reason: 'Late by 3 days: on-time not earned',
    });
  });

  it('adds approved leave days', () => {
    const { onTime } = judgeTask(
      facts({ handedInOn: '2026-11-03', leave: [{ from: '2026-10-30', to: '2026-10-31' }] }),
    );
    expect(onTime.earned).toBe(true);
  });

  it('takes back only the days the person added themselves', () => {
    const { onTime } = judgeTask(
      facts({
        dueDate: '2026-11-10',
        selfMoves: [{ from: '2026-11-03', to: '2026-11-05' }],
        handedInOn: '2026-11-09',
      }),
    );
    // Self move +2; a manager later extended it to 10 Nov: judged against 8 Nov.
    expect(onTime).toMatchObject({ judgedDue: '2026-11-08', earned: false, daysLate: 1 });
  });

  it('a short wait does not count as a whole day', () => {
    const { onTime } = judgeTask(
      facts({
        handedInOn: '2026-11-02',
        outsideWaits: [
          { party: 'customer', from: '2026-10-29T11:00:00+05:30', to: '2026-10-29T11:05:00+05:30' },
          { party: 'customer', from: '2026-10-30T17:00:00+05:30', to: '2026-10-31T09:00:00+05:30' },
        ],
      }),
    );
    expect(onTime).toMatchObject({ earned: false, daysLate: 1, judgedDue: '2026-11-01' });
  });

  it('counts a day covered by both a wait and leave once', () => {
    const { onTime } = judgeTask(
      facts({
        handedInOn: '2026-11-02',
        outsideWaits: [wait('customer', '2026-10-30', '2026-10-31')],
        leave: [{ from: '2026-10-30', to: '2026-10-30' }],
      }),
    );
    expect(onTime.judgedDue).toBe('2026-11-02');
    expect(onTime.earned).toBe(true);
  });

  it('names others when several parties held it up', () => {
    const { onTime } = judgeTask(
      facts({
        handedInOn: '2026-11-06',
        outsideWaits: [
          wait('bank', '2026-10-27', '2026-10-29'),
          wait('customer', '2026-10-29', '2026-10-30'),
        ],
      }),
    );
    expect(onTime.reason).toBe('Late by 2 days after 3 days waiting on others: on-time not earned');
  });
});

describe('judgeTask: time with the reviewer', () => {
  it('does not count days a send-back sat with the reviewer', () => {
    const { onTime } = judgeTask(
      facts({
        handedInOn: '2026-11-04',
        outsideWaits: [wait('reviewer', '2026-10-26', '2026-10-31')],
      }),
    );
    expect(onTime).toMatchObject({
      earned: true,
      reason: 'On time (after 5 days with the reviewer)',
    });
  });
});

describe('judgeTask: first-time right', () => {
  it('first-time right only with an approval step', () => {
    expect(judgeTask(facts({})).firstTimeRight).toBeNull();
    expect(judgeTask(facts({ needsApproval: true })).firstTimeRight).toEqual({
      earned: true,
      reason: 'First-time right',
    });
  });

  it('sent back once loses first-time right with the count', () => {
    expect(judgeTask(facts({ needsApproval: true, returns: 1 })).firstTimeRight).toEqual({
      earned: false,
      reason: 'Sent back 1 time: first-time right not earned',
    });
    expect(judgeTask(facts({ needsApproval: true, returns: 2 })).firstTimeRight?.reason).toBe(
      'Sent back 2 times: first-time right not earned',
    );
  });
});
