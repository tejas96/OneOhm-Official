import { hashPassword } from '@oneohm/database';

/** What an edit to a person may change (Team → edit person). */
export interface PersonPatch {
  readonly fullName?: string | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly employeeCode?: string | null | undefined;
  readonly password?: string | undefined;
  readonly roleIds?: string[] | undefined;
  readonly status?: 'active' | 'inactive' | undefined;
  readonly onLeave?: boolean | undefined;
  readonly designation?: string | null | undefined;
}

/** The users-table columns an edit touches; the password is stored only as a hash. */
export async function personFields(patch: PersonPatch) {
  return {
    ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.phone !== undefined ? { phoneE164: patch.phone } : {}),
    ...(patch.employeeCode !== undefined ? { employeeCode: patch.employeeCode } : {}),
    ...(patch.password ? { passwordHash: await hashPassword(patch.password) } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.onLeave !== undefined ? { onLeave: patch.onLeave } : {}),
    ...(patch.designation !== undefined ? { designation: patch.designation } : {}),
  };
}

/** The audit entry never carries the password, only that it was reset. */
export function auditablePatch(patch: PersonPatch): Record<string, unknown> {
  const { password, ...rest } = patch;
  return { ...rest, ...(password ? { passwordReset: true } : {}) };
}
