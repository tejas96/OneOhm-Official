import { describe, expect, it } from 'vitest';
import { judgeTask, type TaskPointFacts } from './task-points';

const facts = (partial: Partial<TaskPointFacts>): TaskPointFacts => ({
  dueDate: '2026-11-01',
  startDate: '2026-10-25',
  handedInOn: '2026-11-01',
  selfMovedFrom: [],
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
        outsideWaits: [{ from: '2026-10-28', to: '2026-11-01', party: 'bank' }],
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
        outsideWaits: [{ from: '2026-10-28', to: '2026-11-01', party: 'internal' }],
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

  it('judges against the date before a self-reschedule', () => {
    const { onTime } = judgeTask(
      facts({ dueDate: '2026-11-10', selfMovedFrom: ['2026-11-03'], handedInOn: '2026-11-05' }),
    );
    expect(onTime).toMatchObject({ earned: false, daysLate: 2 });
  });

  it('counts a day covered by both a wait and leave once', () => {
    const { onTime } = judgeTask(
      facts({
        handedInOn: '2026-11-02',
        outsideWaits: [{ from: '2026-10-30', to: '2026-10-30', party: 'customer' }],
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
          { from: '2026-10-27', to: '2026-10-28', party: 'bank' },
          { from: '2026-10-29', to: '2026-10-29', party: 'customer' },
        ],
      }),
    );
    expect(onTime.reason).toBe('Late by 2 days after 3 days waiting on others: on-time not earned');
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
