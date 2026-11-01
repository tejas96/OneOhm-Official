import { describe, expect, it } from 'vitest';
import { isNotOnWhatsApp, routeFor, SMS_MAX, smsText } from './contact-channels';

describe('contact channels (WhatsApp first, then SMS, then in person)', () => {
  const base = { channel: 'whatsapp', whatsappUnreachable: false, whatsappOptIn: true } as const;

  it('uses WhatsApp by default', () => {
    expect(routeFor(base)).toBe('whatsapp');
  });

  it('falls back to SMS when the number is not on WhatsApp or opted out', () => {
    expect(routeFor({ ...base, whatsappUnreachable: true })).toBe('sms');
    expect(routeFor({ ...base, whatsappOptIn: false })).toBe('sms');
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
    expect(smsText('Payment received', '₹40,000 for the advance.')).toBe(
      'Payment received. ₹40,000 for the advance. - OneOhm',
    );
    const long = smsText('Update', 'word '.repeat(100));
    expect(long.length).toBeLessThanOrEqual(SMS_MAX);
    expect(long.endsWith('… - OneOhm')).toBe(true);
  });
});
