/** The most list changes sent to the platforms in one run. */
export const MAX_CHANGES = 100_000;

export interface AudienceDiff {
  readonly add: string[];
  readonly remove: string[];
}

/** Who to add (wanted, not on the list yet) and remove (on the list, no longer wanted). */
export function diffAudience(
  wanted: ReadonlySet<string>,
  onList: ReadonlySet<string>,
): AudienceDiff {
  return {
    add: [...wanted].filter((hash) => !onList.has(hash)),
    remove: [...onList].filter((hash) => !wanted.has(hash)),
  };
}

/** Keeps at most `room` changes (adds first); the rest wait for the next run. */
export function capChanges(diff: AudienceDiff, room: number): AudienceDiff {
  const add = diff.add.slice(0, Math.max(0, room));
  return { add, remove: diff.remove.slice(0, Math.max(0, room - add.length)) };
}
