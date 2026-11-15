import { attendanceDays, businessTimeZone, type DatabaseExecutor } from '@oneohm/database';
import { MERGED_DAY_MESSAGES, mergedDayProblem } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { type AppError, conflict, invalid } from '../../common/http/errors';

/** One pending correction per person per day: the index name, for a friendly refusal. */
export const PENDING_INDEX = 'attendance_corrections_pending_unique';

export const ALREADY_PENDING = 'You already have a correction waiting for that day.';

/** Two requests at once got past the check; the database index refused the second. */
export function pendingClash(error: unknown): AppError | null {
  const seen = (value: unknown) =>
    typeof value === 'object' && value !== null
      ? (value as { code?: string; constraint_name?: string; constraint?: string })
      : undefined;
  for (const candidate of [seen(error), seen((error as { cause?: unknown })?.cause)]) {
    const constraint = candidate?.constraint_name ?? candidate?.constraint;
    if (candidate?.code === '23505' && constraint === PENDING_INDEX)
      return conflict(ALREADY_PENDING, 'pending_exists');
  }
  return null;
}

/**
 * The day a correction would leave must make sense (live review A6): checked against the
 * day as recorded now, so a corrected check-in is judged with the check-out already there.
 * Asked when the person requests it and again when it is approved, as the day may have
 * changed in between. `onProblem` picks the error: a bad request, or a stale approval.
 */
export async function assertDayFits(
  db: DatabaseExecutor,
  input: {
    readonly userId: string;
    readonly workDate: string;
    readonly checkInAt: Date | null;
    readonly checkOutAt: Date | null;
  },
  onProblem: 'request' | 'approval',
): Promise<void> {
  const [day] = await db
    .select({ checkInAt: attendanceDays.checkInAt, checkOutAt: attendanceDays.checkOutAt })
    .from(attendanceDays)
    .where(
      and(eq(attendanceDays.userId, input.userId), eq(attendanceDays.workDate, input.workDate)),
    )
    .limit(1);
  const problem = mergedDayProblem({ ...input, day: day ?? null, timeZone: businessTimeZone() });
  if (!problem) return;
  const message = MERGED_DAY_MESSAGES[problem];
  if (onProblem === 'approval')
    throw conflict(
      `${message} The day changed after it was asked; reject it or ask again.`,
      'stale',
    );
  throw invalid(message, {
    [problem === 'check_in_date' ? 'checkInAt' : 'checkOutAt']: message,
  });
}
