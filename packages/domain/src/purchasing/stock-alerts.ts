/**
 * Stock shortage alerts (PRD 3.10): the store and procurement hear once, when free stock
 * of an item (all locations) drops below its reorder level, not on every movement after.
 */
const EPSILON = 0.0005;

export function fellBelowMinimum(minimum: number, freeBefore: number, freeAfter: number): boolean {
  return freeBefore - minimum > -EPSILON && minimum - freeAfter > EPSILON;
}
