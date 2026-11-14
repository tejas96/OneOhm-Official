import { describe, expect, it } from 'vitest';
import { assertReadyForDate } from './visit-ready';

describe('a DISCOM date for a task that cannot start', () => {
  it('is refused while an earlier task is open', () => {
    expect(() => assertReadyForDate('inspection', ['Generation meter test'])).toThrow(
      /waiting for Generation meter test/,
    );
    expect(() => assertReadyForDate('net_meter', ['A'])).toThrow();
  });
  it('is allowed once the earlier tasks are done', () => {
    expect(() => assertReadyForDate('inspection', [])).not.toThrow();
  });
  it('does not stop other visits being booked ahead', () => {
    expect(() => assertReadyForDate('installation', ['Material'])).not.toThrow();
    expect(() => assertReadyForDate('survey', ['x'])).not.toThrow();
  });
});
