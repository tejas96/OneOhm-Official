import type { Role } from '@oneohm/api-contracts';
import { type Capability, ROLE_KINDS } from '@oneohm/domain';

/** Column order: the protected role first, then staff, partner and reseller roles. */
export function orderRolesForGrid(roles: readonly Role[]): Role[] {
  const rank = (role: Role) => (role.system ? -1 : ROLE_KINDS.indexOf(role.kind));
  return [...roles].sort((a, b) => rank(a) - rank(b));
}

/**
 * A permission label as the end of a sentence ("Approve discounts" → "approve discounts"),
 * so a cell can be named "Sales can approve discounts". Leading acronyms keep their case.
 */
export function asPredicate(label: string): string {
  const [first = '', second = ''] = label;
  if (second && second === second.toLocaleUpperCase() && second !== second.toLocaleLowerCase())
    return label;
  return first.toLocaleLowerCase() + label.slice(1);
}

/** The role list with one cell set to granted or not. */
export function withCapability(
  roles: readonly Role[] | undefined,
  roleId: string,
  capability: Capability,
  granted: boolean,
): Role[] | undefined {
  return roles?.map((role) => {
    if (role.id !== roleId) return role;
    const rest = role.capabilities.filter((held) => held !== capability);
    return { ...role, capabilities: granted ? [...rest, capability] : rest };
  });
}
