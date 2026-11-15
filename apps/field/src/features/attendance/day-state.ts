import type { AttendanceDay } from '@oneohm/api-contracts';
import { canResumeDay } from '@oneohm/domain';

/** What the attendance card offers: the button, or the end of the day (A2, A9, A10). */
export type DayState =
  | { readonly kind: 'in' }
  | { readonly kind: 'out'; readonly fromEarlier: boolean }
  | { readonly kind: 'sending' }
  | { readonly kind: 'done'; readonly canResume: boolean; readonly autoClosed: boolean };

/**
 * The open day counts even from an earlier date (Check out after midnight ends that day).
 * A tap waiting for signal counts as already made: a waiting check-in offers Check out,
 * a waiting check-out offers nothing until it is sent.
 */
export function dayStateOf(
  day: AttendanceDay | null,
  businessDate: string,
  queued: 'in' | 'out' | null,
): DayState {
  if (queued === 'out') return { kind: 'sending' };
  if (queued === 'in') return { kind: 'out', fromEarlier: false };
  if (!day) return { kind: 'in' };
  if (!day.checkOutAt) return { kind: 'out', fromEarlier: day.workDate < businessDate };
  return {
    kind: 'done',
    canResume: canResumeDay(
      {
        workDate: day.workDate,
        checkOutAt: new Date(day.checkOutAt),
        autoClosedAt: day.autoClosed ? new Date(day.checkOutAt) : null,
        correctedAt: day.corrected ? new Date(day.checkOutAt) : null,
      },
      businessDate,
    ),
    autoClosed: day.autoClosed === true,
  };
}
