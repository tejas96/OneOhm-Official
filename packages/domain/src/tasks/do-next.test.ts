import { describe, expect, it } from 'vitest';
import { doNextReason, type RankInput, rankTasks } from './do-next';

const today = '2026-11-02';

interface Ranked extends RankInput {
  readonly id: string;
}

function rank(partial: Partial<Ranked> & { readonly id?: string }): Ranked {
  return {
    id: 'task',
    priority: 'none',
    prioritySetBy: null,
    overdue: false,
    dueDate: '2026-11-10',
    startDate: '2026-11-01',
    blocking: [],
    unlocksPayment: false,
    blocksUrgent: false,
    blockedBy: [],
    ...partial,
  };
}

const ids = (tasks: readonly Ranked[]) => rankTasks(tasks, today).map((task) => task.id);

describe('rankTasks', () => {
  it('puts urgent before an overdue task with no priority', () => {
    expect(
      ids([
        rank({ id: 'overdue', overdue: true, dueDate: '2026-10-30' }),
        rank({ id: 'urgent', priority: 'urgent' }),
      ]),
    ).toEqual(['urgent', 'overdue']);
  });

  it('puts low after a not-overdue task with no priority', () => {
    expect(
      ids([rank({ id: 'low', priority: 'low', dueDate: '2026-11-03' }), rank({ id: 'none' })]),
    ).toEqual(['none', 'low']);
  });

  it('ranks a task that blocks an urgent one in the urgent band', () => {
    expect(
      ids([rank({ id: 'high', priority: 'high' }), rank({ id: 'unblock', blocksUrgent: true })]),
    ).toEqual(['unblock', 'high']);
  });

  it('puts overdue first, then more blocked work, then payment, then due date', () => {
    expect(
      ids([
        rank({ id: 'early', dueDate: '2026-11-04' }),
        rank({ id: 'payment', unlocksPayment: true }),
        rank({ id: 'blocks2', blocking: ['a', 'b'] }),
        rank({ id: 'overdue', overdue: true, dueDate: '2026-10-31' }),
      ]),
    ).toEqual(['overdue', 'blocks2', 'payment', 'early']);
  });

  it('puts tasks that can start before blocked ones, even urgent ones', () => {
    expect(
      ids([
        rank({ id: 'blockedUrgent', priority: 'urgent', blockedBy: ['Survey'] }),
        rank({ id: 'ready' }),
      ]),
    ).toEqual(['ready', 'blockedUrgent']);
  });

  it('breaks ties by the oldest start date', () => {
    expect(
      ids([
        rank({ id: 'newer', startDate: '2026-11-02' }),
        rank({ id: 'older', startDate: '2026-10-01' }),
      ]),
    ).toEqual(['older', 'newer']);
  });
});

describe('doNextReason', () => {
  it('gives the reason, best first', () => {
    expect(
      doNextReason(rank({ priority: 'urgent', prioritySetBy: { fullName: 'Asha' } }), today),
    ).toEqual({ kind: 'priority', priority: 'urgent', by: 'Asha' });
    expect(doNextReason(rank({ blocksUrgent: true }), today)).toEqual({ kind: 'blocksUrgent' });
    expect(doNextReason(rank({ overdue: true, dueDate: '2026-10-31' }), today)).toEqual({
      kind: 'overdue',
      days: 2,
    });
    expect(doNextReason(rank({ blocking: ['a', 'b'], unlocksPayment: true }), today)).toEqual({
      kind: 'blocks',
      count: 2,
      payment: true,
    });
    expect(doNextReason(rank({}), today)).toEqual({ kind: 'due', date: '2026-11-10' });
  });

  it('says a Low task was marked Low, so its place makes sense', () => {
    expect(
      doNextReason(
        rank({
          priority: 'low',
          overdue: true,
          dueDate: '2026-10-30',
          prioritySetBy: { fullName: 'Asha' },
        }),
        today,
      ),
    ).toEqual({ kind: 'priority', priority: 'low', by: 'Asha' });
  });
});
