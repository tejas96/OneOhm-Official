/** A partial update as it arrives from a request: any field may be missing or undefined. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

/** Drops undefined fields so an update only touches what was sent. */
export function definedOnly<T extends Record<string, unknown>>(
  patch: T,
): Partial<{ [K in keyof T]: Exclude<T[K], undefined> }> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<{
    [K in keyof T]: Exclude<T[K], undefined>;
  }>;
}
