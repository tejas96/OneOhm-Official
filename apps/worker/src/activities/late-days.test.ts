import { describe, expect, it } from 'vitest';
import { lateDays } from './late-days';

describe('lateDays', () => {
  it('counts days past the due date', () => {
    expect(lateDays('2026-10-28', '2026-11-02', [])).toBe(5);
  });

  it('does not count days the person was on leave', () => {
    expect(lateDays('2026-10-28', '2026-11-02', [{ from: '2026-10-29', to: '2026-11-01' }])).toBe(
      1,
    );
  });

  it('is zero when not late', () => {
    expect(lateDays('2026-11-05', '2026-11-02', [])).toBe(0);
  });
});
