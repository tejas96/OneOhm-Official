/**
 * How the phone records the duty route (Duty Day step 1). The consent words in
 * `copy/workforce.ts` promise "about every 2 minutes or every 100 metres": change these
 * only together with those words and LOCATION_CONSENT_VERSION.
 */
export const RECORD_EVERY_MS = 120_000;
export const RECORD_EVERY_M = 100;

/** The server takes at most this many points in one upload. */
export const BATCH_MAX = 200;
/** Upload as soon as this many points are waiting. */
export const FLUSH_AT = 20;
/** Upload at least this often while on duty. */
export const FLUSH_EVERY_MS = 5 * 60_000;
/**
 * A phone offline for days keeps this many points at most; the oldest go first and are
 * counted, so the file cannot grow without end.
 */
export const QUEUE_CAP = 5_000;
