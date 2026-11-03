import type { ProjectDetail } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { handOverBody, handOverNeeds, KEEP, livePicks } from './handover-needs';

const task = (assignee: string | null, proposed: string | null, status: string) => ({
  assignee: assignee ? { id: assignee } : null,
  proposedAssignee: proposed ? { id: proposed } : null,
  status,
});
const project = (tasks: ReturnType<typeof task>[]) =>
  ({
    setup: {
      team: ['a', 'b', 'c'].map((id) => ({ id, fullName: id.toUpperCase(), active: true })),
    },
    tasks,
  }) as unknown as ProjectDetail;

describe('handOverNeeds', () => {
  it('lists removed people with open tasks and proposals, not finished ones', () => {
    const p = project([
      task('a', null, 'in_progress'),
      task(null, 'a', 'pending'),
      task('a', null, 'completed'),
      task('b', null, 'ready'),
    ]);
    expect(handOverNeeds(p, ['a', 'b', 'c'], ['b', 'c'])).toEqual([
      { id: 'a', fullName: 'A', open: 2 },
    ]);
  });

  it('skips removed people with nothing open and counts a task once', () => {
    const p = project([task('a', 'a', 'ready'), task('b', null, 'completed')]);
    expect(handOverNeeds(p, ['a', 'b', 'c'], ['c'])).toEqual([{ id: 'a', fullName: 'A', open: 1 }]);
    expect(handOverNeeds(p, ['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([]);
  });
});

describe('handOverNeeds snapshot', () => {
  it('ignores people who joined the team after the sheet opened', () => {
    const p = project([task('a', null, 'ready')]);
    expect(handOverNeeds(p, ['b', 'c'], ['b', 'c'])).toEqual([]);
  });
});

describe('handOverBody', () => {
  it('sends one move per removed person; keep becomes null', () => {
    const needs = [
      { id: 'a', fullName: 'A', open: 2 },
      { id: 'b', fullName: 'B', open: 1 },
    ];
    expect(handOverBody(needs, { a: 'x', b: KEEP })).toEqual([
      { fromUserId: 'a', toUserId: 'x' },
      { fromUserId: 'b', toUserId: null },
    ]);
  });
});

describe('livePicks', () => {
  const needs = [
    { id: 'a', fullName: 'A', open: 2 },
    { id: 'b', fullName: 'B', open: 1 },
  ];

  it('clears a pick whose target now needs a hand-over too', () => {
    expect(livePicks(needs, { a: 'b', b: 'x' })).toEqual({ b: 'x' });
  });

  it('keeps picks of staying people and keep, drops picks of people no longer leaving', () => {
    expect(livePicks(needs, { a: 'x', b: KEEP, c: 'y' })).toEqual({ a: 'x', b: KEEP });
  });
});
