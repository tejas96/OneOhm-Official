import { describe, expect, it } from 'vitest';
import { checkRating, ratingSummary, stageDone } from './stage-ratings';

describe('stage ratings (PRD 5.7)', () => {
  it('accepts whole stars from 1 to 5', () => {
    expect(checkRating(5, null)).toBeNull();
    expect(checkRating(0, null)).toBe('range');
    expect(checkRating(4.5, null)).toBe('range');
  });

  it('asks for a reason with a low rating', () => {
    expect(checkRating(2, '')).toBe('comment_needed');
    expect(checkRating(1, 'Crew came late and left a mess')).toBeNull();
    expect(checkRating(3, '')).toBeNull();
  });

  it('opens a stage for rating only when all its work is done', () => {
    const tasks = [
      { stage: 'survey', status: 'completed' },
      { stage: 'installation', status: 'completed' },
      { stage: 'installation', status: 'in_progress' },
    ];
    expect(stageDone(tasks, 'survey')).toBe(true);
    expect(stageDone(tasks, 'installation')).toBe(false);
    expect(stageDone(tasks, 'commissioning')).toBe(false);
  });

  it('hides an average until three customers have rated', () => {
    expect(ratingSummary([5, 1])).toEqual({ average: null, count: 2 });
    expect(ratingSummary([5, 4, 4])).toEqual({ average: 4.3, count: 3 });
  });
});
