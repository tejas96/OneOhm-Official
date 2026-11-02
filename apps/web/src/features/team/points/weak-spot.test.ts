import { describe, expect, it } from 'vitest';
import { weakSpot } from './weak-spot';

describe('weakSpot', () => {
  it('names the lowest rate under 80%', () => {
    expect(weakSpot({ tasksJudged: 10, onTimeRate: 0.7, firstTimeRate: 0.5 })).toEqual({
      part: 'firstTime',
      rate: 0.5,
    });
    expect(weakSpot({ tasksJudged: 4, onTimeRate: 0.75, firstTimeRate: null })).toEqual({
      part: 'onTime',
      rate: 0.75,
    });
  });

  it('says nothing when all are good', () => {
    expect(weakSpot({ tasksJudged: 5, onTimeRate: 0.8, firstTimeRate: 1 })).toBeNull();
  });

  it('says nothing when nothing was judged', () => {
    expect(weakSpot({ tasksJudged: 0, onTimeRate: null, firstTimeRate: null })).toBeNull();
  });
});
