import type { Role } from '@oneohm/api-contracts';
import type { CapabilityChange } from './use-toggle-capability';

/** Archiving takes a role's permissions away from its holders at once, so ask first. */
export function archiveNeedsConfirm(role: Role | null, archived: boolean): boolean {
  return role !== null && archived && !role.archived && role.memberCount > 0;
}

/** After a permission is taken away, the change that gives it back; null after a grant. */
export function undoOf(change: CapabilityChange): CapabilityChange | null {
  return change.grant ? null : { ...change, grant: true };
}
