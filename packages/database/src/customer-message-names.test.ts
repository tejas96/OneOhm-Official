import { describe, expect, it } from 'vitest';
import { customerNotice } from './customer-message';
import {
  INSTALMENT_NAMES,
  instalmentTag,
  instalmentWords,
  projectWords,
} from './customer-message-names';
import { localValues } from './customer-message-words';

describe('plain names in customer templates (live QA C9)', () => {
  it('names an instalment by its place and share, the last one as last', () => {
    expect(instalmentWords('en-IN', instalmentTag({ index: 1, count: 3, percent: 65 }))).toBe(
      '2nd instalment (65%)',
    );
    expect(instalmentWords('en-IN', instalmentTag({ index: 2, count: 3, percent: 10 }))).toBe(
      'Last instalment (10%)',
    );
    expect(instalmentWords('mr-IN', '0/3/25')).toBe('पहिला हप्ता (25%)');
    expect(instalmentWords('hi-IN', '1/3/65')).toBe('दूसरी किस्त (65%)');
    expect(instalmentWords('mr-IN', 'bank')).toBe('बँक कर्ज');
    expect(instalmentWords('en-IN', 'nonsense')).toBeUndefined();
    expect(INSTALMENT_NAMES['en-IN'](0, 1)).toBe('1st instalment');
  });

  it('names the project by its town and size, the code only without a town', () => {
    expect(projectWords({ code: 'OH-2026-013', city: 'Sangli', capacityWp: 3270 })).toBe(
      'Sangli · 3.27 kW',
    );
    expect(projectWords({ code: 'OH-2026-013', city: ' ', capacityWp: 3270 })).toBe('OH-2026-013');
  });

  it('a Marathi or Hindi template gets the instalment in that language', () => {
    const payload = {
      customer: 'Ramesh',
      amount: '₹1,19,580',
      milestone: '2nd instalment (65%)',
      instalment: '1/3/65',
      project: 'Sangli · 3.27 kW',
    };
    expect(localValues('mr-IN', 'payment_link', payload).milestone).toBe('दुसरा हप्ता (65%)');
    expect(localValues('hi-IN', 'payment_reminder', payload).milestone).toBe('दूसरी किस्त (65%)');
    expect(localValues('en-IN', 'payment_link', payload).milestone).toBe('2nd instalment (65%)');
    expect(customerNotice('payment_received', payload, 'k', 'mr-IN')?.body).toContain(
      'दुसरा हप्ता (65%)',
    );
  });
});
