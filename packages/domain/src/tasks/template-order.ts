/**
 * Where tasks new to OneOhm's library go in a list the owner may have reordered: each
 * right after the task before it in the library (or first), so a new survey variant
 * sits beside the survey. Existing tasks keep their order.
 */
export function placeNewTemplates(
  current: readonly string[],
  library: readonly string[],
): string[] {
  const order = [...current];
  for (const [index, key] of library.entries()) {
    if (order.includes(key)) continue;
    const before = library
      .slice(0, index)
      .reverse()
      .find((earlier) => order.includes(earlier));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, key);
  }
  return order;
}
