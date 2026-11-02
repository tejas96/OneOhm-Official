import { describe, expect, it } from 'vitest';
import { holdingUpUrgent } from './urgent-chain';

// Edges: [task, the task it waits for].
describe('holdingUpUrgent', () => {
  it('lifts every open task in the chain under an urgent one', () => {
    const edges = [
      ['c', 'b'],
      ['b', 'a'],
    ] as const;
    expect([...holdingUpUrgent(edges, new Set(['c']))].sort()).toEqual(['a', 'b']);
  });

  it('does not lift tasks that hold up nothing urgent', () => {
    expect([...holdingUpUrgent([['y', 'x']], new Set(['c']))]).toEqual([]);
  });

  it('copes with a loop in bad data', () => {
    const edges = [
      ['a', 'b'],
      ['b', 'a'],
    ] as const;
    expect([...holdingUpUrgent(edges, new Set(['a']))].sort()).toEqual(['a', 'b']);
  });
});
