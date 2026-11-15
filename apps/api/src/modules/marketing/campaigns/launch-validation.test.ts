import { describe, expect, it } from 'vitest';
import { launchProblem } from './launch-validation';

const now = new Date('2026-11-15T06:00:00Z');
const base = {
  goal: 'chats' as const,
  channels: ['instagram' as const, 'facebook' as const],
  dailyBudgetPaise: 50_000,
  segments: [] as ('quoted_not_won' | 'lost_revisit' | 'past_customers')[],
  startsAt: null,
};

describe('launchProblem', () => {
  it('accepts a plain chats campaign', () => {
    expect(launchProblem(base, 'image', now)).toBeNull();
  });

  it('asks for the photo again when it is gone', () => {
    expect(launchProblem(base, null, now)?.field).toBe('mediaId');
  });

  it('keeps Google out of a post', () => {
    const problem = launchProblem({ ...base, goal: 'post', channels: ['google'] }, 'image', now);
    expect(problem?.message).toBe(
      'Google cannot be used for a post. Pick Instagram, Facebook or WhatsApp.',
    );
  });

  it('needs a photo for Google', () => {
    const problem = launchProblem({ ...base, channels: ['google'] }, 'video', now);
    expect(problem?.message).toBe('Google ads need a photo. Add a photo or take Google off.');
  });

  it('needs a photo for WhatsApp messages', () => {
    const problem = launchProblem(
      { ...base, channels: ['whatsapp'], segments: ['lost_revisit'] },
      'video',
      now,
    );
    expect(problem?.message).toBe(
      'WhatsApp messages need a photo. Use a photo, or leave WhatsApp off.',
    );
  });

  it('needs ₹100 a day for each paid place', () => {
    expect(
      launchProblem(
        { ...base, dailyBudgetPaise: 15_000, channels: ['instagram', 'facebook'] },
        'image',
        now,
      ),
    ).toBeNull();
    const two = launchProblem(
      { ...base, dailyBudgetPaise: 15_000, channels: ['instagram', 'google'] },
      'image',
      now,
    );
    expect(two?.field).toBe('dailyBudgetPaise');
    expect(two?.message).toBe('Use at least ₹200 a day: ₹100 for each place.');
  });

  it('does not ask a budget for a post', () => {
    expect(launchProblem({ ...base, goal: 'post', dailyBudgetPaise: 0 }, 'image', now)).toBeNull();
  });

  it('needs a segment for the WhatsApp message', () => {
    const problem = launchProblem({ ...base, channels: ['whatsapp'] }, 'image', now);
    expect(problem?.message).toBe('Pick who should get the WhatsApp message.');
    expect(
      launchProblem({ ...base, channels: ['whatsapp'], segments: ['lost_revisit'] }, 'image', now),
    ).toBeNull();
  });

  it('lets only a post wait for a later day, in the future and within 60 days', () => {
    expect(
      launchProblem({ ...base, startsAt: '2026-11-20T10:00:00Z' }, 'image', now)?.message,
    ).toBe('Only a post can be set for a later day.');
    const post = { ...base, goal: 'post' as const };
    expect(
      launchProblem({ ...post, startsAt: '2026-11-15T05:00:00Z' }, 'image', now)?.message,
    ).toBe('Pick a time in the future.');
    expect(
      launchProblem({ ...post, startsAt: '2027-02-01T05:00:00Z' }, 'image', now)?.message,
    ).toBe('Pick a day within the next 60 days.');
    expect(launchProblem({ ...post, startsAt: '2026-11-20T10:00:00Z' }, 'image', now)).toBeNull();
  });
});
