import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Environment } from '../../config/environment';

/**
 * The "Track live" link of an "on the way" message (Duty Day step 6): which worker is coming to
 * which job on which day, and when the link was made. Signed, so nobody can watch another visit.
 */
export interface TrackToken {
  /** The task, or the service request when `service`. */
  readonly jobId: string;
  readonly service: boolean;
  readonly workerId: string;
  /** The work day (YYYY-MM-DD, business time). */
  readonly day: string;
  /** Seconds since 1970 when the link was made. */
  readonly issuedAt: number;
}

/** The position is shared for this long after the link was made. */
export const TRACK_SHARE_HOURS = 3;
/** After this long the link opens nothing at all. */
export const TRACK_LINK_DAYS = 7;

type TrackSecrets = Pick<Environment, 'FILE_LINK_SECRET' | 'TRACK_LINK_SECRET'>;

/** Track links are signed with their own secret; the file secret stands in when unset. */
export const trackSecret = (env: TrackSecrets): string =>
  env.TRACK_LINK_SECRET ?? env.FILE_LINK_SECRET;

const sign = (secret: string, data: string) =>
  createHmac('sha256', `track:${secret}`).update(data).digest('base64url');

export function signTrackToken(secret: string, token: TrackToken): string {
  const data = Buffer.from(
    JSON.stringify([token.jobId, token.service ? 1 : 0, token.workerId, token.day, token.issuedAt]),
  ).toString('base64url');
  return `${data}.${sign(secret, data)}`;
}

/** The visit a link points to, or null when it was altered or is older than 7 days. */
export function readTrackToken(secret: string, value: string, now = Date.now()): TrackToken | null {
  const [data, mac] = value.split('.');
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(secret, data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [jobId, service, workerId, day, issuedAt] = JSON.parse(
      Buffer.from(data, 'base64url').toString(),
    ) as unknown[];
    if (typeof jobId !== 'string' || typeof workerId !== 'string' || typeof day !== 'string')
      return null;
    if (typeof issuedAt !== 'number') return null;
    if (now - issuedAt * 1000 > TRACK_LINK_DAYS * 86_400_000) return null;
    return { jobId, service: service === 1, workerId, day, issuedAt };
  } catch {
    return null;
  }
}

/** Whether the position may still be shown: under 3 hours since the link was made. */
export const trackSharing = (token: TrackToken, now = Date.now()): boolean =>
  now - token.issuedAt * 1000 < TRACK_SHARE_HOURS * 3_600_000;
