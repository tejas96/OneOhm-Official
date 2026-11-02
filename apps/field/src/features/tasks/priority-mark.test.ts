import { describe, expect, it } from 'vitest';
import { priorityMark } from './priority-mark';

describe('priorityMark', () => {
  it('shows urgent loudly and the rest quietly', () => {
    expect(priorityMark('urgent')).toEqual({ label: 'Urgent', loud: true });
    expect(priorityMark('low')).toEqual({ label: 'Low', loud: false });
  });

  it('shows nothing without a priority, or from an older API', () => {
    expect(priorityMark('none')).toBeNull();
    expect(priorityMark(undefined)).toBeNull();
  });
});
