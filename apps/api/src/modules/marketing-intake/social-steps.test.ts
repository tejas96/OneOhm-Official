import { describe, expect, it } from 'vitest';
import { askText, socialLeadInput, socialPlan } from './social-steps';

describe('Instagram and Facebook chat steps', () => {
  it('asks for a number once, on first contact', () => {
    expect(socialPlan({}, 'Hi, interested in solar')).toMatchObject({ ask: true, makeLead: false });
    expect(socialPlan({ askedNumber: true }, 'Hello?').ask).toBe(false);
  });

  it('makes the lead once when a mobile number comes', () => {
    const first = socialPlan({ askedNumber: true }, 'my no is 98765 43210, Pune');
    expect(first).toEqual({ phone: '+919876543210', makeLead: true, ask: false });
    // Same number again: the chat has its lead.
    expect(socialPlan({ askedNumber: true, leadId: 'l1' }, '98765 43210').makeLead).toBe(false);
    // A number in the very first message is a lead, not a question.
    expect(socialPlan({}, '9876543210')).toMatchObject({ makeLead: true, ask: false });
  });

  it('greets by first name, or "there" for a handle', () => {
    expect(askText('Sunita Jadhav', 'Sun Power')).toContain(
      'Hi Sunita! Thanks for writing to Sun Power.',
    );
    expect(askText('Sunita', '')).toContain('Hi Sunita! Thanks for writing.');
    expect(askText('@sun_power', 'Sun Power')).toContain('Hi there!');
    expect(askText(null, 'Sun Power')).toContain('Please share your WhatsApp number and city');
  });

  it('builds the lead from the chat entry', () => {
    const input = socialLeadInput(
      'messenger',
      '+919876543210',
      'call me on 9876543210',
      { profileName: 'Ravi K' },
      { campaignCode: 'DIWALI26', adId: 'ad-1' },
      'Pune',
    );
    expect(input).toMatchObject({
      name: 'Ravi K',
      source: 'facebook',
      city: 'Pune',
      nextActionNote: 'Call now: wrote on Facebook',
      firstNote: 'Wrote on Facebook: "call me on 9876543210"',
      attribution: { campaignCode: 'DIWALI26', adId: 'ad-1' },
    });
  });
});
