/** A person's own location setting: follow the roles and company, or always on or off. */
export type PersonTracking = 'on' | 'off' | null;

/**
 * Whether location is asked for this person (PRD 4.3), before consent and working
 * hours are checked. Their own setting wins; then their roles, where a role switched
 * off keeps it off (privacy first); then the company switch.
 */
export function trackingSwitchedOn(input: {
  readonly company: boolean;
  readonly roleKeys: readonly string[];
  readonly byRole: Readonly<Record<string, boolean>>;
  readonly person: PersonTracking;
}): boolean {
  if (input.person === 'on') return true;
  if (input.person === 'off') return false;
  const said = input.roleKeys
    .map((key) => input.byRole[key])
    .filter((value): value is boolean => typeof value === 'boolean');
  if (said.includes(false)) return false;
  if (said.includes(true)) return true;
  return input.company;
}
