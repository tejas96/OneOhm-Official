import { describe, expect, it } from 'vitest';
import { splitRatingPoints } from './rating-split';

const DAY = 86_400_000;
const t0 = new Date('2026-01-01T00:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);

describe('splitRatingPoints', () => {
  it('gives a single manager everything', () => {
    expect(splitRatingPoints([{ userId: 'A', from: t0, to: null }], 10, at(5))).toEqual([
      { userId: 'A', points: 10 },
    ]);
  });
  it('splits 30 and 10 days by largest remainder, a tie going to the earlier term', () => {
    const terms = [
      { userId: 'A', from: t0, to: at(30) },
      { userId: 'B', from: at(30), to: null },
    ];
    expect(splitRatingPoints(terms, 10, at(40))).toEqual([
      { userId: 'A', points: 8 },
      { userId: 'B', points: 2 },
    ]);
  });
  it('drops a zero-length term', () => {
    const terms = [
      { userId: 'A', from: t0, to: at(10) },
      { userId: 'B', from: at(10), to: at(10) },
      { userId: 'C', from: at(10), to: null },
    ];
    expect(splitRatingPoints(terms, 10, at(20))).toEqual([
      { userId: 'A', points: 5 },
      { userId: 'C', points: 5 },
    ]);
  });
  it('merges one user across separate terms', () => {
    const terms = [
      { userId: 'A', from: t0, to: at(10) },
      { userId: 'B', from: at(10), to: at(20) },
      { userId: 'A', from: at(20), to: null },
    ];
    expect(splitRatingPoints(terms, 10, at(30))).toEqual([
      { userId: 'A', points: 7 },
      { userId: 'B', points: 3 },
    ]);
  });
  it('returns nothing without terms', () => {
    expect(splitRatingPoints([], 10, at(5))).toEqual([]);
  });
  it('ignores time after the rating', () => {
    const terms = [
      { userId: 'A', from: t0, to: at(10) },
      { userId: 'B', from: at(10), to: null },
    ];
    expect(splitRatingPoints(terms, 10, at(5))).toEqual([{ userId: 'A', points: 10 }]);
  });
});
