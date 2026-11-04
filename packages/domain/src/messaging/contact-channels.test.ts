import { describe, expect, it } from 'vitest';
import {
  handsOverInPerson,
  isNotOnWhatsApp,
  routeFor,
  SMS_MAX,
  skippedAfterStop,
  smsText,
} from './contact-channels';

describe('contact channels (WhatsApp first, then SMS, then in person)', () => {
  const base = { channel: 'whatsapp', whatsappUnreachable: false, whatsappOptIn: true } as const;

  it('uses WhatsApp by default', () => {
    expect(routeFor(base)).toBe('whatsapp');
  });

  it('falls back to SMS when the number is not on WhatsApp or opted out', () => {
    expect(routeFor({ ...base, whatsappUnreachable: true })).toBe('sms');
    expect(routeFor({ ...base, whatsappOptIn: false })).toBe('sms');
  });

  it('after STOP skips only the nice-to-have messages; money, visits and steps still go', () => {
    expect(skippedAfterStop('stage_rating_request', false)).toBe(true);
    expect(skippedAfterStop('referral_reward', false)).toBe(true);
    expect(skippedAfterStop('payment_reminder', false)).toBe(false);
    expect(skippedAfterStop('service_visit_booked', false)).toBe(false);
    expect(skippedAfterStop('stage_rating_request', true)).toBe(false);
  });

  it('keeps the channel the team set for the customer', () => {
    expect(routeFor({ ...base, channel: 'in_person' })).toBe('in_person');
    expect(routeFor({ ...base, channel: 'sms' })).toBe('sms');
  });

  it('knows Meta’s not-on-WhatsApp code', () => {
    expect(isNotOnWhatsApp(131026)).toBe(true);
    expect(isNotOnWhatsApp(131047)).toBe(false);
    expect(isNotOnWhatsApp(null)).toBe(false);
  });

  it('writes a short signed SMS and trims long ones at a word', () => {
    expect(smsText('Payment received', '₹40,000 for the advance.', 'Surya Power')).toBe(
      'Payment received. ₹40,000 for the advance. - Surya Power',
    );
    const long = smsText('Update', 'word '.repeat(100), 'Surya Power');
    expect(long.length).toBeLessThanOrEqual(SMS_MAX);
    expect(long.endsWith('… - Surya Power')).toBe(true);
  });

  it('signs with the company name from its profile, or not at all before one is set', () => {
    expect(smsText('Update', 'All set.', ' OneOhm ')).toBe('Update. All set. - OneOhm');
    expect(smsText('Update', 'All set.', '')).toBe('Update. All set.');
    expect(smsText('Update', 'word '.repeat(100), '').length).toBeLessThanOrEqual(SMS_MAX);
  });

  it('adds no second stop after a title that ends a sentence', () => {
    expect(smsText('How did we do?', 'Please rate it.', 'OneOhm')).toBe(
      'How did we do? Please rate it. - OneOhm',
    );
  });
});

describe('handsOverInPerson', () => {
  it('asks the team to tell an in-person customer when the message is on', () => {
    expect(handsOverInPerson('in_person', true)).toBe(true);
  });

  it('asks nothing of the team when the owner turned the message off', () => {
    expect(handsOverInPerson('in_person', false)).toBe(false);
  });

  it('never hands over a message going by WhatsApp or SMS', () => {
    expect(handsOverInPerson('whatsapp', true)).toBe(false);
  });
});
