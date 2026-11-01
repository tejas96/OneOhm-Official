/**
 * Capturing a site's DISCOM in the field (PRD 4.2 "Electricity bill, consumer number and
 * DISCOM capture"; PRD 4.5 at the lead stage).
 */

/** The task that verifies the electricity bill (it records the consumer number) also confirms the DISCOM. */
export function asksForDiscom(task: { readonly captures: readonly string[] }): boolean {
  return task.captures.includes('consumer_number');
}

/**
 * The DISCOM to show as picked: the site's own, or, when the company works with a single
 * active DISCOM (e.g. MSEDCL only), that one, for the person to confirm or change.
 * Otherwise nothing is guessed.
 */
export function defaultDiscomId(
  discoms: readonly { readonly id: string; readonly active: boolean }[],
  current: string | null,
): string | null {
  if (current) return current;
  const active = discoms.filter((discom) => discom.active);
  return active.length === 1 ? (active[0]?.id ?? null) : null;
}

/** The DISCOMs to offer: the active ones, plus the site's current one if it was retired. */
export function discomChoices<T extends { readonly id: string; readonly active: boolean }>(
  discoms: readonly T[],
  current: string | null,
): T[] {
  return discoms.filter((discom) => discom.active || discom.id === current);
}
