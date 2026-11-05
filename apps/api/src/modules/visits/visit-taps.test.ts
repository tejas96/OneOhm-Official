import { describe, expect, it } from 'vitest';
import { visitTaps } from './visit-messages';
import { readVisitTap } from './visit-taps';

const id = '0b6f1c7e-7d3a-4f0e-9c1d-2a4b5c6d7e8f';

describe('visit taps', () => {
  it('reads every id the messages make', () => {
    expect(readVisitTap(visitTaps.ask(id))).toEqual({ t: 'ask', actionId: id });
    expect(readVisitTap(visitTaps.day(id, '2026-11-06'))).toEqual({
      t: 'day',
      actionId: id,
      day: '2026-11-06',
    });
    expect(readVisitTap(visitTaps.slot(id, '2026-11-06', 'afternoon'))).toEqual({
      t: 'slot',
      actionId: id,
      day: '2026-11-06',
      slot: 'afternoon',
    });
    expect(readVisitTap(visitTaps.confirm(id))).toEqual({ t: 'confirm', visitId: id });
    expect(readVisitTap(visitTaps.okay(id))).toEqual({ t: 'okay', visitId: id });
    expect(readVisitTap(visitTaps.change(id))).toEqual({ t: 'change', visitId: id });
  });
  it('ignores other ids', () => {
    expect(readVisitTap('pay:x')).toBeNull();
    expect(readVisitTap('vslot:bad')).toBeNull();
    expect(readVisitTap(null)).toBeNull();
  });
});
