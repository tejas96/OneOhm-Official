import { describe, expect, it } from 'vitest';
import { claimBoxState } from './claim-state';

const day = { claim: null, claimable: false, closed: false, visits: [{}] } as never;
const make = (patch: object) => ({ ...(day as object), ...patch }) as never;

describe('claimBoxState (S5)', () => {
  it('asks the person to end the day while it is running', () =>
    expect(claimBoxState(day)).toBe('end_day'));
  it('offers the form once the day is closed with travel', () =>
    expect(claimBoxState(make({ closed: true, claimable: true }))).toBe('form'));
  it('says nothing to claim for a closed day with no distance', () =>
    expect(claimBoxState(make({ closed: true }))).toBe('nothing'));
  it('shows nothing on a day with no visits', () =>
    expect(claimBoxState(make({ visits: [] }))).toBe('none'));
  it('shows the claim when one is live', () =>
    expect(claimBoxState(make({ claim: { status: 'pending' } }))).toBe('claimed'));
  it('offers the form again once an approved claim was voided (S9)', () =>
    expect(
      claimBoxState(
        make({
          closed: true,
          claimable: true,
          claim: { status: 'cancelled', voidReason: 'Wrong day' },
        }),
      ),
    ).toBe('form'));
});
