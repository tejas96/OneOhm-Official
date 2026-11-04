import type { Capability } from '@oneohm/domain';

export interface GrantableRole {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly Capability[];
}

/**
 * The names of roles this person may not give or take away. Someone who manages roles
 * may change any role; anyone else (HR adding staff) only roles whose permissions they
 * already hold, so nobody can hand themselves or anyone else more power than they have.
 */
export function rolesOutOfReach(
  held: ReadonlySet<Capability>,
  changed: readonly GrantableRole[],
): string[] {
  if (held.has('roles.manage')) return [];
  return changed
    .filter((role) => role.capabilities.some((capability) => !held.has(capability)))
    .map((role) => role.name);
}

/**
 * The names of archived roles this change would newly give. Archived roles give no
 * permissions, so nobody may be given one; someone who already holds one keeps it until
 * it is taken off them.
 */
export function archivedRolesNewlyGiven(
  given: readonly { id: string; name: string; archived: boolean }[],
  alreadyHeld: ReadonlySet<string>,
): string[] {
  return given.filter((role) => role.archived && !alreadyHeld.has(role.id)).map((r) => r.name);
}
