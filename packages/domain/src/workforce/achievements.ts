/**
 * Simple achievements from what is already recorded (PRD 4.7): on-time work, customers'
 * five-star ratings, recognition and points. Nothing is entered by hand, so they always
 * reflect verified performance.
 */
export const ACHIEVEMENTS = [
  { key: 'on_time_streak', target: 5 },
  { key: 'on_time_25', target: 25 },
  { key: 'five_star', target: 1 },
  { key: 'five_star_5', target: 5 },
  { key: 'recognised', target: 1 },
  { key: 'points_500', target: 500 },
] as const;
export type AchievementKey = (typeof ACHIEVEMENTS)[number]['key'];

export interface AchievementFacts {
  /** Tasks finished on time in a row, newest first (see `onTimeStreak`). */
  readonly onTimeStreak: number;
  readonly onTimeTotal: number;
  /** Customers who gave this person five stars on a stage. */
  readonly fiveStars: number;
  readonly recognitions: number;
  readonly pointsTotal: number;
}

export interface Achievement {
  readonly key: AchievementKey;
  readonly earned: boolean;
  /** Where the person is, capped at the target. */
  readonly current: number;
  readonly target: number;
}

const FACT: Readonly<Record<AchievementKey, (facts: AchievementFacts) => number>> = {
  on_time_streak: (facts) => facts.onTimeStreak,
  on_time_25: (facts) => facts.onTimeTotal,
  five_star: (facts) => facts.fiveStars,
  five_star_5: (facts) => facts.fiveStars,
  recognised: (facts) => facts.recognitions,
  points_500: (facts) => facts.pointsTotal,
};

export function achievementsFrom(facts: AchievementFacts): Achievement[] {
  return ACHIEVEMENTS.map(({ key, target }) => {
    const value = Math.max(0, FACT[key](facts));
    return { key, earned: value >= target, current: Math.min(value, target), target };
  });
}

/**
 * Finished tasks on time in a row, newest first. Work made late by the customer, a bank
 * or the DISCOM is skipped, so it neither breaks nor extends the streak (PRD 3.12).
 */
export function onTimeStreak(
  finished: readonly { readonly onTime: boolean; readonly lateOnOthers: boolean }[],
): number {
  let streak = 0;
  for (const task of finished) {
    if (task.onTime) streak += 1;
    else if (!task.lateOnOthers) break;
  }
  return streak;
}
