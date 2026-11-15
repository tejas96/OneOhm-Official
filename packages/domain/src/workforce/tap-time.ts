/** A tap older than this is refused (live review A9). */
export const TAP_WINDOW_MS = 12 * 3_600_000;

/** A tap up to this old is just a slow network: used with no flag. */
export const TAP_FRESH_MS = 30 * 60_000;

/** A phone clock a little ahead of the server is not a lie. */
export const TAP_SKEW_MS = 2 * 60_000;

export type TapRefusal = 'tap_too_old' | 'tap_in_future';

export type TapVerdict =
  | { readonly ok: true; readonly at: Date; readonly delayed: boolean }
  | { readonly ok: false; readonly code: TapRefusal };

/**
 * The moment to record for a check-in or check-out, from the phone's own tap time (a tap
 * made without signal and sent later is not judged late by the delay):
 * - none, or within 30 minutes of the server: used as it is;
 * - 30 minutes to 12 hours old: used, but `delayed`, so the manager reviews it;
 * - older than 12 hours: refused as `tap_too_old`;
 * - more than 2 minutes ahead of the server: refused as `tap_in_future` (less than that is
 *   clock skew and is recorded as now).
 * A tap before `floor` (the open day's check-in, for a check-out) cannot be right, so the
 * server's time is used. The server time is always kept next to the tap time by the caller.
 */
export function judgeTap(
  tappedAt: Date | null | undefined,
  now: Date,
  floor?: Date | null,
): TapVerdict {
  if (!tappedAt || Number.isNaN(tappedAt.getTime())) return { ok: true, at: now, delayed: false };
  const age = now.getTime() - tappedAt.getTime();
  if (age > TAP_WINDOW_MS) return { ok: false, code: 'tap_too_old' };
  if (age < -TAP_SKEW_MS) return { ok: false, code: 'tap_in_future' };
  if (age < 0) return { ok: true, at: now, delayed: false };
  if (floor && tappedAt < floor) return { ok: true, at: now, delayed: false };
  return { ok: true, at: tappedAt, delayed: age > TAP_FRESH_MS };
}

export interface ResumableDay {
  readonly workDate: string;
  readonly checkOutAt: Date | null;
  readonly autoClosedAt: Date | null;
  readonly correctedAt: Date | null;
}

/**
 * Whether the person may take back an End duty (live review A10): the same business day,
 * checked out by them, not ended by the night job and not changed by a correction.
 */
export function canResumeDay(day: ResumableDay | null, today: string): boolean {
  return Boolean(
    day && day.workDate === today && day.checkOutAt && !day.autoClosedAt && !day.correctedAt,
  );
}
