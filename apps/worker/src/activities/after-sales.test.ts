import { describe, expect, it } from 'vitest';
import { visitDescription } from './after-sales';

const visit = {
  visitName: 'cleaning',
  position: 1,
  visits: 2,
  planName: 'Care Plus',
  dueOn: '2026-11-07',
};

describe('visitDescription', () => {
  it('tells the technician what the visit includes', () => {
    expect(visitDescription({ ...visit, includes: ['Panel cleaning', 'Inverter check'] })).toBe(
      'Planned cleaning visit 1 of 2 under the Care Plus AMC, on Sat, 7 Nov. Includes: Panel cleaning; Inverter check.',
    );
  });

  it('leaves the list out when the plan names nothing', () => {
    expect(visitDescription({ ...visit, includes: [] })).toBe(
      'Planned cleaning visit 1 of 2 under the Care Plus AMC, on Sat, 7 Nov.',
    );
  });
});
