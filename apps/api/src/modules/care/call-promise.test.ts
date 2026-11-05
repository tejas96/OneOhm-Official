import { describe, expect, it } from 'vitest';
import { CALL_WHEN_LISTS, callPromise, callWhen } from './call-promise';

const ZONE = 'Asia/Kolkata';
// 2026-11-04 is a Wednesday; India is +05:30 all year.
const at = (iso: string) => new Date(`${iso}+05:30`);

describe('the promised call', () => {
  it('in working hours is two hours away, never after closing', () => {
    const noon = callPromise(at('2026-11-04T12:00:00'), ZONE);
    expect(noon).toMatchObject({ kind: 'by', clock: '2:00 pm' });
    expect(noon.by.getTime()).toBe(at('2026-11-04T14:00:00').getTime());
    const late = callPromise(at('2026-11-04T17:45:00'), ZONE);
    expect(late.by.getTime()).toBe(at('2026-11-04T18:30:00').getTime());
    expect(late.clock).toBe('6:30 pm');
  });

  it('out of hours is the next working morning', () => {
    expect(callPromise(at('2026-11-04T20:00:00'), ZONE).kind).toBe('tomorrow');
    expect(callPromise(at('2026-11-04T07:00:00'), ZONE).kind).toBe('today');
    const saturdayNight = callPromise(at('2026-11-07T20:00:00'), ZONE);
    expect(saturdayNight.kind).toBe('monday');
    expect(saturdayNight.by.getTime()).toBe(at('2026-11-09T11:30:00').getTime());
  });

  it('is said in three languages', () => {
    expect(CALL_WHEN_LISTS.en.by('4:30 pm')).toBe('by 4:30 pm today');
    expect(CALL_WHEN_LISTS.mr.tomorrow).toContain('उद्या');
    expect(CALL_WHEN_LISTS.hi.monday).toContain('सोमवार');
    expect(callWhen({ by: new Date(), kind: 'tomorrow', clock: '' })).toBe('tomorrow from 9:30');
  });
});
