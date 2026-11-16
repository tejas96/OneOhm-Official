/**
 * What went wrong, in words for an alert. Temporal wraps an activity's error ("Activity
 * task failed") around the real one, so the innermost message is the useful one.
 */
export function failureText(error: unknown): string {
  let current: unknown = error;
  let text = '';
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (message) text = message;
    current = current instanceof Error ? current.cause : undefined;
  }
  return text || 'The job failed.';
}
