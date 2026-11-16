import type { LocationResult } from '@oneohm/api-contracts';
import { ATTENDANCE } from '../../copy/workforce';

/**
 * The one sentence to say after a check-in or check-out about the location, or null when
 * all is well. What the phone knows first (it asked and was refused, or got no fix), then
 * what the server did with the reading, then, gently, where it stood against the places.
 */
export function locationNotice(
  result: LocationResult | undefined,
  missed: 'denied' | 'nofix' | null,
): string | null {
  if (missed === 'denied') return ATTENDANCE.permissionDenied;
  if (missed === 'nofix') return ATTENDANCE.noFix;
  if (!result) return null;
  if (!result.saved && result.reason) return ATTENDANCE.notSaved[result.reason];
  if (!result.saved) return ATTENDANCE.notSaved.no_reading;
  if (result.fence === 'outside') return ATTENDANCE.fenceOutside;
  if (result.fence === 'unsure') return ATTENDANCE.fenceUnsure;
  return null;
}
