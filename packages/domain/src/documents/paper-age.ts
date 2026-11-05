const DAY = 86_400_000;

/**
 * Whether a paper still counts for a checklist item with a maximum age (redesign 5.4): it
 * does when the item has no maximum, or the paper was received within that many days. (The
 * checklist applies it to checked papers only, and only until the DISCOM application is done.)
 */
export function isCurrentPaper(
  receivedAt: Date,
  maxAgeDays: number | null | undefined,
  now: Date,
): boolean {
  if (!maxAgeDays) return true;
  return now.getTime() - receivedAt.getTime() <= maxAgeDays * DAY;
}

/**
 * The net-metering application of any DISCOM (MSEDCL's `discom_application`, or another's
 * `<code>_application`; not the subsidy's). A paper's maximum age matters until it is done.
 */
export const isDiscomApplication = (templateKey: string): boolean =>
  templateKey === 'discom_application' ||
  (templateKey.endsWith('_application') && templateKey !== 'subsidy_application');
