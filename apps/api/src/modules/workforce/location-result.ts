import type { LocationResult } from '@oneohm/api-contracts';
import type { PlaceMatch } from '@oneohm/domain';
import type { LocationSkip } from './tracking';

/**
 * What the check-in or check-out tells the phone about the location (live review A5): kept
 * or not, why not, and how the reading stood against the places (unsure when the accuracy
 * was too poor to say). Never silent: a reading that is dropped always has a reason.
 */
export function locationResultOf(
  skipped: LocationSkip | null,
  match: PlaceMatch | null,
): LocationResult {
  return {
    saved: skipped === null,
    reason: skipped,
    fence: !match ? null : match.inside === null ? 'unsure' : match.inside ? 'inside' : 'outside',
  };
}
