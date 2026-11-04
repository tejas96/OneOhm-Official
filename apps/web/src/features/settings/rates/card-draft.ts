/** True when a form's draft differs from what was saved, so leaving would lose it. */
export function hasUnsaved(draft: unknown, saved: unknown): boolean {
  return !same(draft, saved);
}

function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || !left || !right) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => same(a[key], b[key]));
}
