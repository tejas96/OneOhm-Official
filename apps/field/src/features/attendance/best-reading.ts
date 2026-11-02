/** Good enough: stop reading once the phone says it is within this many metres. */
export const GOOD_ENOUGH_M = 10;
/** Give up waiting for better after this long and keep the best so far. */
export const GIVE_UP_MS = 15_000;

/** Index of the most accurate reading; one with no accuracy ranks last. Null for none. */
export function pickBest(readings: readonly { accuracyM: number | null }[]): number | null {
  let best: number | null = null;
  let bestM = Number.POSITIVE_INFINITY;
  readings.forEach((reading, index) => {
    const m = reading.accuracyM ?? Number.POSITIVE_INFINITY;
    if (best === null || m < bestM) {
      best = index;
      bestM = m;
    }
  });
  return best;
}

export function shouldStop(best: number | null, elapsedMs: number): boolean {
  return (best !== null && best <= GOOD_ENOUGH_M) || elapsedMs >= GIVE_UP_MS;
}
