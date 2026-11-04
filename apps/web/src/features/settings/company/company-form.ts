/**
 * The error for a list field. The API names a bad line by its place (`phones.0`), but the
 * form has one box for the whole list, so any line's error is shown there.
 */
export function listFieldError(
  errors: Readonly<Record<string, string>>,
  field: string,
): string | undefined {
  if (errors[field]) return errors[field];
  const line = Object.keys(errors).find((key) => key.startsWith(`${field}.`));
  return line ? errors[line] : undefined;
}

/** The phone list as the box shows it: one number per line. */
export function phonesText(phones: readonly string[]): string {
  return phones.join('\n');
}

/** The box's lines back to a list, dropping blank lines. */
export function splitPhones(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
