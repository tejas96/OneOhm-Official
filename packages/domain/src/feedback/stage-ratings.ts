import type { EpcStage } from '../epc/stages';

/**
 * The stages a customer rates (PRD 5.7): the survey visit, the installation, and the
 * switch-on and handover. Support is rated per service request; the whole project once
 * after handover.
 */
export const RATED_STAGES = [
  'survey',
  'installation',
  'commissioning',
] as const satisfies readonly EpcStage[];
export type RatedStage = (typeof RATED_STAGES)[number];

export const isRatedStage = (stage: string): stage is RatedStage =>
  (RATED_STAGES as readonly string[]).includes(stage);

/** At or below this, the customer must say why and the project manager is told. */
export const LOW_RATING = 2;

/**
 * Safeguard against one bad day deciding a reputation: a person's average shows only
 * once this many customers have rated them.
 */
export const MIN_RATINGS_FOR_AVERAGE = 3;

export type RatingProblem = 'range' | 'comment_needed';

/** Stars are whole numbers 1–5; a low rating needs a few words. */
export function checkRating(
  rating: number,
  comment: string | null | undefined,
): RatingProblem | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'range';
  if (rating <= LOW_RATING && (comment ?? '').trim().length < 5) return 'comment_needed';
  return null;
}

/** A stage can be rated once it had work and every task in it is done. */
export function stageDone(
  tasks: readonly { readonly stage: string; readonly status: string }[],
  stage: RatedStage,
): boolean {
  const inStage = tasks.filter((task) => task.stage === stage);
  return inStage.length > 0 && inStage.every((task) => task.status === 'completed');
}

/** The average to one decimal, or null until enough customers have rated. */
export function ratingSummary(ratings: readonly number[]): {
  readonly average: number | null;
  readonly count: number;
} {
  const count = ratings.length;
  if (count < MIN_RATINGS_FOR_AVERAGE) return { average: null, count };
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  return { average: Math.round((sum / count) * 10) / 10, count };
}
