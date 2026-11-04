/** Every error the API named for one payment step (steps.1.shareBp and the like). */
export function stepErrors(errors: Readonly<Record<string, string>>, index: number): string[] {
  const prefix = `steps.${index}`;
  return Object.entries(errors)
    .filter(([path]) => path === prefix || path.startsWith(`${prefix}.`))
    .map(([, message]) => message);
}
