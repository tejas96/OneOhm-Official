/**
 * Number boxes left empty. An empty box is not saved as 0 (₹0 means every bill needs an
 * approver; 0 days is refused): it keeps the last value and shows a message until filled.
 */
export function markBlank(
  blank: ReadonlySet<string>,
  field: string,
  value: number | null,
): ReadonlySet<string> {
  const next = new Set(blank);
  if (value === null) next.add(field);
  else next.delete(field);
  return next;
}

/** The server's field errors, with an empty box's own message in its place. */
export function withBlankErrors(
  errors: Readonly<Record<string, string>>,
  blank: ReadonlySet<string>,
  messages: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const merged: Record<string, string> = { ...errors };
  for (const field of blank) {
    const message = messages[field];
    if (message) merged[field] = message;
  }
  return merged;
}
