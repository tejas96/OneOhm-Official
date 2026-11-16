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

/** What may be read now (PRD 4.3): `on`, or why not. */
export type TrackingState = 'on' | 'no_consent' | 'policy_off' | 'outside_hours';

/** Switched off wins, then consent to the current words, then working hours. */
export function trackingState(input: {
  readonly switchedOn: boolean;
  readonly consentGiven: boolean;
  readonly inHours: boolean;
}): TrackingState {
  if (!input.switchedOn) return 'policy_off';
  if (!input.consentGiven) return 'no_consent';
  return input.inHours ? 'on' : 'outside_hours';
}
