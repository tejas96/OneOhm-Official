import { describe, expect, it } from 'vitest';
import { reviewHistory } from './review-history';

const at = (day: string) => new Date(`${day}T10:00:00+05:30`);
const review = (
  outcome: string,
  submittedBy: string,
  day: string,
  decidedDay: string | null = null,
) => ({ outcome, submittedBy, at: at(day), decidedAt: decidedDay ? at(decidedDay) : null });

describe('reviewHistory', () => {
  it('credits the accepted hand-in and its time', () => {
    const history = reviewHistory(true, [
      review('returned', 'ravi', '2026-10-28', '2026-10-30'),
      review('approved', 'priya', '2026-10-31', '2026-11-01'),
    ]);
    expect(history.accepted).toMatchObject({ submittedBy: 'priya' });
  });

  it('counts only send-backs of the person who handed it in', () => {
    const history = reviewHistory(true, [
      review('returned', 'ravi', '2026-10-28', '2026-10-30'),
      review('approved', 'priya', '2026-10-31', '2026-11-01'),
    ]);
    expect(history.returns).toBe(0);
  });

  it('gives no first-time right when the doer approved their own work', () => {
    const history = reviewHistory(true, [
      review('self_approved', 'priya', '2026-10-31', '2026-10-31'),
    ]);
    expect(history.needsApproval).toBe(false);
  });

  it('lists the time each send-back sat with the reviewer', () => {
    const history = reviewHistory(true, [
      review('returned', 'priya', '2026-10-24', '2026-10-31'),
      review('approved', 'priya', '2026-11-01', '2026-11-02'),
    ]);
    expect(history.withReviewer).toEqual([
      {
        party: 'reviewer',
        from: at('2026-10-24').toISOString(),
        to: at('2026-10-31').toISOString(),
      },
    ]);
  });
});
