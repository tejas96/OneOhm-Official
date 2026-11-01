import { describe, expect, it } from 'vitest';
import { isLive, projectToRate } from './rating-rule';

const project = (
  id: string,
  status: 'active' | 'operational' | 'completed' | 'cancelled',
  commissioning: 'done' | 'current' | 'upcoming' = 'upcoming',
  feedbackGiven = false,
) => ({
  id,
  status,
  feedbackGiven,
  stages: [
    { stage: 'installation' as const, state: 'done' as const },
    { stage: 'commissioning' as const, state: commissioning },
  ],
});

describe('offer a rating only once the system is live', () => {
  it('is live when operational, completed or switched on', () => {
    expect(isLive(project('a', 'operational'))).toBe(true);
    expect(isLive(project('a', 'completed'))).toBe(true);
    expect(isLive(project('a', 'active', 'done'))).toBe(true);
    expect(isLive(project('a', 'active', 'current'))).toBe(false);
  });

  it('waits while nothing is switched on', () => {
    expect(projectToRate([project('a', 'active'), project('b', 'active', 'current')])).toBeNull();
    expect(projectToRate([])).toBeNull();
  });

  it('rates the newest live home not rated yet, else the newest live one', () => {
    const older = project('old', 'completed');
    const newer = project('new', 'active', 'done', true);
    expect(projectToRate([older, newer, project('c', 'active')])).toBe('old');
    expect(projectToRate([{ ...older, feedbackGiven: true }, newer])).toBe('new');
  });
});
