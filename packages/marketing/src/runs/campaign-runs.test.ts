import { describe, expect, it } from 'vitest';
import { postOutcome } from './publish-posts';
import {
  firstNameOf,
  NOBODY_WORDS,
  offerPayload,
  pickPeople,
  whatsappResult,
} from './queue-messages';
import { landingPageUrl, mediaPublicUrl, type SegmentPerson, todayInIndia } from './run-types';
import { onePerPhone, quotedCutoff } from './segments';

const person = (phone: string, name = 'Asha Patil'): SegmentPerson => ({
  phoneE164: phone,
  name,
  leadId: null,
  customerId: null,
});
const context = { apiPublicUrl: 'https://api.example.in/', businessName: 'Sun Power' };

describe('public links', () => {
  it('builds media and landing links without a double slash', () => {
    expect(mediaPublicUrl('https://api.example.in/', 'abc')).toBe(
      'https://api.example.in/v1/m/abc',
    );
    expect(landingPageUrl('https://api.example.in', 'SOLAR-01')).toBe(
      'https://api.example.in/v1/go/SOLAR-01',
    );
  });
});

describe('segments', () => {
  it('keeps one row per phone', () => {
    const rows = onePerPhone([person('+919800000001', 'A'), person('+919800000001', 'B')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('A');
  });

  it('gives a phone to the first segment that has it across segments', () => {
    const picked = pickPeople([
      { segment: 'quoted_not_won', people: [person('+919800000001'), person('+919800000002')] },
      { segment: 'past_customers', people: [person('+919800000002'), person('+919800000003')] },
    ]);
    expect(picked.map((row) => [row.person.phoneE164, row.segment])).toEqual([
      ['+919800000001', 'quoted_not_won'],
      ['+919800000002', 'quoted_not_won'],
      ['+919800000003', 'past_customers'],
    ]);
  });

  it('waits a week after a quotation went out', () => {
    // Sent on or before 8 Nov counts on 15 Nov: the cut is the start of 9 Nov, India time.
    expect(quotedCutoff('2026-11-15').toISOString()).toBe('2026-11-08T18:30:00.000Z');
  });

  it('reads today on the India clock', () => {
    expect(todayInIndia(new Date('2026-11-14T19:00:00Z'))).toBe('2026-11-15');
  });
});

describe('offer message', () => {
  it('fills the template with the first name, business, flat text and photo', () => {
    expect(firstNameOf('  Asha   Patil ')).toBe('Asha');
    const payload = offerPayload(
      person('+919800000001'),
      'Free survey\nthis week',
      context,
      'https://x/y.jpg',
    );
    expect(payload).toEqual({
      customer: 'Asha',
      company: 'Sun Power',
      message: 'Free survey this week',
      imageUrl: 'https://x/y.jpg',
    });
  });

  it('leaves the photo out for a video', () => {
    expect(offerPayload(person('+919800000001'), 'Hi', context, null)).not.toHaveProperty(
      'imageUrl',
    );
  });
});

describe('post result', () => {
  it('is posted when one channel worked, noting the other', () => {
    const outcome = postOutcome([
      { channel: 'instagram', postId: 'ig1', error: null },
      { channel: 'facebook', postId: null, error: 'Facebook refused the photo.' },
    ]);
    expect(outcome.state).toBe('posted');
    expect(outcome.ids).toEqual({ instagramPost: 'ig1' });
    expect(outcome.notes).toEqual(['Facebook: Facebook refused the photo.']);
    expect(outcome.lastError).toBeNull();
  });

  it('fails with the reason when every channel failed', () => {
    const outcome = postOutcome([{ channel: 'facebook', postId: null, error: 'Token ended.' }]);
    expect(outcome.state).toBe('failed');
    expect(outcome.lastError).toBe('Token ended.');
  });
});

describe('whatsapp result', () => {
  it('says how many were queued', () => {
    expect(whatsappResult(3)).toEqual({
      state: 'sent',
      notes: ['Sent to 3 people'],
      lastError: null,
    });
  });

  it('is a neutral note, not a failure, when nobody was in the lists', () => {
    const result = whatsappResult(0);
    expect(result.state).toBe('sent');
    expect(result.notes).toEqual([NOBODY_WORDS]);
    expect(result.lastError).toBeNull();
  });
});
