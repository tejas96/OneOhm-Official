import type { GeoPoint } from '@oneohm/domain';
import { SITE } from '../../copy/site';

/** Where the pin sheet starts: the worker's reading, with how sure the phone is of it. */
export type PinStart = GeoPoint & { readonly accuracyM: number | null };

/** The card's button: pin the roof, or move the pin that is already saved. */
export function pinLabel(sitePoint: GeoPoint | null): string {
  return sitePoint ? SITE.movePin : SITE.pinRoof;
}

/**
 * What tapping "Pin the roof" does: open the sheet on the reading, else on the saved
 * point. With neither, save the check-in reading as before maps when the visit has one
 * (`canSetSite`), else ask the worker to share their location.
 */
export function pinOutcome(
  start: PinStart | null,
  saved: GeoPoint | null,
  canSetSite: boolean,
): { kind: 'open'; start: PinStart | null } | { kind: 'gps' } | { kind: 'toast'; message: string } {
  if (start || saved) return { kind: 'open', start };
  if (canSetSite) return { kind: 'gps' };
  return { kind: 'toast', message: SITE.pinNeedsLocation };
}

/** The toast once a pin is saved; a flagged pin waits for the office to check it. */
export function pinSavedMessage(flagged: boolean): string {
  return flagged ? SITE.pinnedFlagged : SITE.pinned;
}

/** A pin that failed for want of signal is kept and sent again; a refused one is not. */
export function shouldKeepPin(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'network'
  );
}
