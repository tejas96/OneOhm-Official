import { todayIn } from '@oneohm/shared';
import { ATTENDANCE } from '../../copy/workforce';
import { BUSINESS_TIME_ZONE, clockTime } from '../../lib/dates';
import type { RefusedTap } from './tap-queue';

/** The codes the server uses for a tap it will never accept (older than 12 hours, or ahead). */
const TAP_CODES = ['tap_too_old', 'tap_in_future'];

export interface RefusalNotice {
  readonly message: string;
  /** The day to ask a correction for, when the refusal is about the tap's time. */
  readonly correctionDate: string | null;
}

/**
 * What to tell the person about a tap the server refused for good. A tap that was too old
 * (or from a clock that was ahead) is dropped with the time it was made and a path to the
 * correction sheet for that day; anything else shows the server's own sentence.
 */
export function refusalNotice({ tap, error }: RefusedTap): RefusalNotice {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && TAP_CODES.includes(code))
    return {
      message: ATTENDANCE.tapTooOld(tap.kind, clockTime(tap.tappedAt)),
      correctionDate: todayIn(BUSINESS_TIME_ZONE, new Date(tap.tappedAt)),
    };
  const message =
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  return { message, correctionDate: null };
}
