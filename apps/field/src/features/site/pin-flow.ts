import type { GeoPoint } from '@oneohm/domain';
import { SITE } from '../../copy/site';

/** Where the pin sheet starts: the worker's reading, with how sure the phone is of it. */
export type PinStart = GeoPoint & { readonly accuracyM: number | null };

/** The card's button: pin the roof, or move the pin that is already saved. */
export function pinLabel(sitePoint: GeoPoint | null): string {
  return sitePoint ? SITE.movePin : SITE.pinRoof;
}

/**
 * Whether the sheet can open: it centres on the reading, else on the saved point. With
 * neither it has nowhere to start, so the worker is asked to share their location.
 */
export function pinOutcome(
  start: PinStart | null,
  saved: GeoPoint | null,
): { open: true; start: PinStart | null } | { open: false; message: string } {
  if (start || saved) return { open: true, start };
  return { open: false, message: SITE.pinNeedsLocation };
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
