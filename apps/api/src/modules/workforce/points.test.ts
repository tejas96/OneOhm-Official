import { describe, expect, it } from 'vitest';
import { taskPointLines } from './points';

const hit = { earned: true, reason: 'On time' };
const miss = { earned: false, reason: 'Late by 2 days' };
const right = { earned: true, reason: 'Approved first time' };

describe('taskPointLines', () => {
  it('writes each part, 0 with the reason when missed', () => {
    const lines = taskPointLines(
      { onTime: miss, firstTimeRight: right },
      { onTimeTask: 10, firstTimeRight: 5 },
    );
    expect(lines.map((line) => [line.sourceType, line.points])).toEqual([
      ['task_on_time', 0],
      ['task_first_time', 5],
    ]);
  });

  it('writes nothing for a kind of points set to 0', () => {
    const lines = taskPointLines(
      { onTime: hit, firstTimeRight: right },
      { onTimeTask: 0, firstTimeRight: 5 },
    );
    expect(lines.map((line) => line.sourceType)).toEqual(['task_first_time']);
    expect(
      taskPointLines({ onTime: hit, firstTimeRight: null }, { onTimeTask: 0, firstTimeRight: 0 }),
    ).toEqual([]);
  });
});
