import { isCurrentPaper, sameAsk } from '@oneohm/domain';

// Small rules behind a project's document checklist.

/**
 * The files that still count for an item: a checked paper older than the item's maximum age
 * no longer does (redesign 5.4, until the DISCOM application is done); one still waiting
 * for its check does.
 */
export const currentFiles = <T extends { checkedAt: Date | null; createdAt: Date }>(
  files: readonly T[],
  maxAgeDays: number | null | undefined,
  now: Date,
): T[] =>
  files.filter((file) => !file.checkedAt || isCurrentPaper(file.createdAt, maxAgeDays, now));

/** missing, received and waiting for the team's look, or checked. */
export const checkOf = (onFile: number, unchecked: number) =>
  onFile === 0
    ? ('missing' as const)
    : unchecked > 0
      ? ('to_check' as const)
      : ('checked' as const);

/** Any open ask of this kind on this home (or for this person), or of this item, covers the row. */
export const isAsked = (
  open: readonly { category: string; requirementKey: string | null }[],
  key: string,
  category: string,
): boolean =>
  open.some(
    (one) =>
      one.category === category ||
      sameAsk(
        { requirementKey: key, category },
        { requirementKey: one.requirementKey, category: one.category },
      ),
  );
