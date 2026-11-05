import { describe, expect, it } from 'vitest';
import { careTaps, isCareTap, readCareTap } from './care-taps';
import { readUpi } from './upi';

const ID = '3f1c2a64-0b1e-4c8e-9a55-1f4f3c2b7d10';

describe('care taps', () => {
  it('reads what each button or row stands for', () => {
    expect(readCareTap(careTaps.what('inverter'))).toEqual({ t: 'what', value: 'inverter' });
    expect(readCareTap(careTaps.since('week'))).toEqual({ t: 'since', value: 'week' });
    expect(readCareTap(careTaps.done)).toEqual({ t: 'done' });
    expect(readCareTap(careTaps.rate(ID, 2))).toEqual({ t: 'rate', id: ID, stars: 2 });
    expect(readCareTap(careTaps.rateGo(ID))).toEqual({ t: 'rateGo', id: ID });
    expect(readCareTap(careTaps.fixedYes(ID))).toEqual({ t: 'fixed', id: ID, working: true });
    expect(readCareTap(careTaps.fixedNo(ID))).toEqual({ t: 'fixed', id: ID, working: false });
    expect(readCareTap(careTaps.city('Sangli'))).toEqual({ t: 'city', value: 'Sangli' });
    expect(readCareTap(careTaps.link)).toEqual({ t: 'link' });
    expect(readCareTap(careTaps.upi(ID))).toEqual({ t: 'upi', id: ID });
    expect(readCareTap(careTaps.amcRenew(ID))).toEqual({ t: 'amc', id: ID, renew: true });
    expect(readCareTap(careTaps.amcTalk(ID))).toEqual({ t: 'amc', id: ID, renew: false });
  });

  it('knows nothing else', () => {
    for (const id of [
      'menu',
      'go:problem',
      'pb:what:nonsense',
      `rt:${ID}:6`,
      `rt:${ID}:0`,
      'rate:5',
    ])
      expect(isCareTap(id)).toBe(false);
  });
});

describe('UPI ID', () => {
  it('accepts name@bank in any case and strips spaces', () => {
    expect(readUpi(' Suresh.Patil@OKSBI ')).toBe('suresh.patil@oksbi');
    expect(readUpi('9876543210@ybl')).toBe('9876543210@ybl');
  });

  it('refuses what is not a UPI ID', () => {
    for (const bad of [
      '',
      'suresh',
      'suresh@',
      '@bank',
      'a@b',
      'name@bank@bank',
      'my phone',
      '98765',
    ]) {
      expect(readUpi(bad)).toBeNull();
    }
  });
});
