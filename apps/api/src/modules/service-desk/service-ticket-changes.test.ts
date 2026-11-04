import { describe, expect, it } from 'vitest';
import { changesFor } from './service-ticket-changes';

const raised = new Date('2026-11-01T04:00:00.000Z');
const now = new Date('2026-11-02T04:00:00.000Z');
const before = { status: 'open' as const, respondedAt: null, createdAt: raised };
const hour = 3_600_000;

describe('changesFor', () => {
  it('works out the due times again from the new category, counted from when it was raised', () => {
    const changes = changesFor({ category: 'inverter' }, before, now, {
      hours: { responseHours: 2, resolutionHours: 24 },
      scheduledFor: null,
    });
    expect(changes.category).toBe('inverter');
    expect(changes.responseDueAt).toEqual(new Date(raised.getTime() + 2 * hour));
    expect(changes.resolutionDueAt).toEqual(new Date(raised.getTime() + 24 * hour));
  });

  it('clears the due times when the new category has none', () => {
    const changes = changesFor({ category: 'other' }, before, now, {
      hours: null,
      scheduledFor: null,
    });
    expect(changes.responseDueAt).toBeNull();
    expect(changes.resolutionDueAt).toBeNull();
  });

  it('leaves the due times alone when the category stays', () => {
    const changes = changesFor({ status: 'in_progress' }, before, now);
    expect(changes).not.toHaveProperty('responseDueAt');
    expect(changes.respondedAt).toBe(now);
  });
});
