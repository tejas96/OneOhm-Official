import { describe, expect, it } from 'vitest';
import { onPeriods, usageFrom, wasOnAt } from './referral-usage';

const at = (time: string) => new Date(`2026-11-01T${time}:00Z`);

describe('campaign usage', () => {
  it('counts only rewards for referrals in this campaign against its limits', () => {
    const usage = usageFrom([
      { customerId: 'asha', projectId: 'p1', amountPaise: 50_000, inCampaign: false },
      { customerId: 'asha', projectId: 'p2', amountPaise: 20_000, inCampaign: true },
    ]);
    expect(usage.campaignPaise).toBe(20_000);
    expect(usage.byCustomer.get('asha')).toEqual({ count: 1, paise: 20_000 });
  });

  it('still never rewards a project twice, whatever the campaign', () => {
    const usage = usageFrom([
      { customerId: 'asha', projectId: 'p1', amountPaise: 50_000, inCampaign: false },
    ]);
    expect(usage.projects.has('p1')).toBe(true);
  });
});

describe('when the programme was on', () => {
  const periods = onPeriods(
    [
      { at: at('10:00'), active: true },
      { at: at('11:00'), active: false },
      { at: at('12:00'), active: false },
      { at: at('13:00'), active: true },
    ],
    true,
  );

  it('earns for an event that happened while it was on', () => {
    expect(wasOnAt(periods, at('10:30'))).toBe(true);
    expect(wasOnAt(periods, at('14:00'))).toBe(true);
  });

  it('earns nothing for an event that happened while it was off', () => {
    expect(wasOnAt(periods, at('11:30'))).toBe(false);
    expect(wasOnAt(periods, at('09:00'))).toBe(false);
  });

  it('treats a programme with no saved history as on all along when it is on', () => {
    expect(wasOnAt(onPeriods([], true), at('09:00'))).toBe(true);
    expect(wasOnAt(onPeriods([], false), at('09:00'))).toBe(false);
  });
});
