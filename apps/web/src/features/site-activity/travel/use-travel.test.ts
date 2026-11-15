import type { TravelClaim } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { canDecideClaim, canVoidClaim, claimState } from './use-travel';

const claim = (patch: Partial<TravelClaim>) =>
  ({ status: 'pending', paid: false, canDecide: true, canVoid: true, ...patch }) as TravelClaim;

describe('who sees the decide and void buttons', () => {
  it('shows Approve and Decline on a waiting claim only to someone who may decide it (S10)', () => {
    expect(canDecideClaim(claim({}))).toBe(true);
    expect(canDecideClaim(claim({ canDecide: false }))).toBe(false);
    expect(canDecideClaim(claim({ status: 'approved' }))).toBe(false);
  });

  it('shows Void on an approved, unpaid claim to finance and HR only (S9, S10)', () => {
    expect(canVoidClaim(claim({ status: 'approved' }))).toBe(true);
    // A reporting manager may decide but not void.
    expect(canVoidClaim(claim({ status: 'approved', canDecide: true, canVoid: false }))).toBe(
      false,
    );
    expect(canVoidClaim(claim({ status: 'approved', paid: true }))).toBe(false);
    expect(canVoidClaim(claim({ status: 'pending' }))).toBe(false);
  });

  it('tells a voided claim from one the worker withdrew', () => {
    expect(claimState(claim({ status: 'cancelled' }))).toBe('cancelled');
    expect(claimState(claim({ status: 'cancelled', voidedAt: '2026-11-16T10:00:00.000Z' }))).toBe(
      'voided',
    );
  });
});
