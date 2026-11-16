import { describe, expect, it } from 'vitest';
import { workInScope } from './live-site-lookup';

const base = { ids: ['ravi', 'asha'], assigneeIds: [], crews: [], namedByAlert: false };

describe('workInScope', () => {
  it("finds a site off the map through the assignee, today's crew or an alert", () => {
    expect(workInScope(base)).toBe(false);
    expect(workInScope({ ...base, assigneeIds: ['asha'] })).toBe(true);
    expect(workInScope({ ...base, crews: [['om'], ['ravi']] })).toBe(true);
    expect(workInScope({ ...base, namedByAlert: true })).toBe(true);
  });

  it('keeps out work of people the caller does not look after', () => {
    expect(workInScope({ ...base, assigneeIds: ['om'], crews: [['om']] })).toBe(false);
  });
});
