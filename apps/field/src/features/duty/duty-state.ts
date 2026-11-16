import type { AttendanceDay } from '@oneohm/api-contracts';
import type { DutyPointRejection } from '@oneohm/domain';

/** How the route is being recorded right now. */
export type RouteMode = 'on' | 'foreground' | 'no_permission' | 'off';

/**
 * Whether the route should be recording: the person's day is open (or a check-in waits for
 * signal and no check-out follows it), they agreed to the current words and location is on
 * for them. A check-out waiting for signal already counts as the end.
 */
export function shouldRecord(input: {
  readonly day: AttendanceDay | null;
  readonly queued: 'in' | 'out' | null;
  readonly consentGiven: boolean;
  readonly captureLocation: boolean;
}): boolean {
  if (!input.captureLocation || !input.consentGiven) return false;
  if (input.queued === 'out') return false;
  if (input.queued === 'in') return true;
  return Boolean(input.day && !input.day.checkOutAt);
}

export type RouteLine =
  | { readonly kind: 'on' | 'foreground' | 'fix' }
  | { readonly kind: 'waiting'; readonly count: number }
  | null;

/**
 * The one status line on the Today card while on duty. A missing permission comes first
 * (it can be fixed with a tap), then points that cannot be uploaded, then how it records.
 */
export function routeLineOf(input: {
  readonly recording: boolean;
  readonly mode: RouteMode;
  readonly waiting: number;
  readonly stalled: boolean;
}): RouteLine {
  if (!input.recording) return null;
  if (input.mode === 'no_permission') return { kind: 'fix' };
  if (input.stalled && input.waiting > 0) return { kind: 'waiting', count: input.waiting };
  if (input.mode === 'foreground') return { kind: 'foreground' };
  return input.mode === 'on' ? { kind: 'on' } : null;
}

/** Makers whose battery savers close apps that are not on their allowed list. */
const AGGRESSIVE = ['xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'oneplus'];

export function needsBatteryHint(os: string, manufacturer: string | null | undefined): boolean {
  if (os !== 'android' || !manufacturer) return false;
  const maker = manufacturer.toLowerCase();
  return AGGRESSIVE.some((name) => maker.includes(name));
}

/** Why the server turned points away that mean recording should stop with the app closed. */
const STOP_ON: readonly DutyPointRejection[] = ['no_open_day', 'no_consent', 'policy_off'];

/**
 * Whether the background task should stop recording after an upload. A 401 always stops it
 * (the session is gone, so nothing could be uploaded and the next person must not inherit
 * the recording); the server turning points away because the day is over or location is off
 * stops it only with the app closed, as an open app notices that itself.
 */
export function shouldStopBackground(
  result: {
    readonly reasons: readonly DutyPointRejection[];
    readonly unauthorized: boolean;
  } | null,
  appActive: boolean,
): boolean {
  if (!result) return false;
  if (result.unauthorized) return true;
  return !appActive && result.reasons.some((reason) => STOP_ON.includes(reason));
}

/** Points files this old are of no use: the server takes points only for open or just-closed days. */
export const FILE_KEEP_MS = 14 * 86_400_000;

/**
 * The saved points files to delete: a person's file that has not been written for 14 days.
 * Files of other people on the phone are kept until then; they are never sent under anyone else.
 */
export function staleDutyFiles(
  files: readonly { readonly name: string; readonly modifiedAt: number | null }[],
  now: number,
): string[] {
  return files
    .filter(
      (file) =>
        /^points-.+\.json$/.test(file.name) &&
        file.modifiedAt !== null &&
        now - file.modifiedAt > FILE_KEEP_MS,
    )
    .map((file) => file.name);
}
