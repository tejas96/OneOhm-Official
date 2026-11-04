/** What an edit to a person may change (Team → edit person). */
export interface PersonPatch {
  readonly fullName?: string | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly employeeCode?: string | null | undefined;
  /** Clears the password, signs them out and sends the invite again. */
  readonly requireNewPassword?: true | undefined;
  readonly roleIds?: string[] | undefined;
  readonly status?: 'active' | 'inactive' | undefined;
  readonly onLeave?: boolean | undefined;
  readonly designation?: string | null | undefined;
  /** Skill keys; replaces the person's skills when given (PRD 3.7). */
  readonly skills?: string[] | undefined;
}

/** The users-table columns an edit touches. */
export function personFields(patch: PersonPatch) {
  return {
    ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.phone !== undefined ? { phoneE164: patch.phone } : {}),
    ...(patch.employeeCode !== undefined ? { employeeCode: patch.employeeCode } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.onLeave !== undefined ? { onLeave: patch.onLeave } : {}),
    ...(patch.designation !== undefined ? { designation: patch.designation } : {}),
  };
}

/** The audit entry says a new password was required, nothing more. */
export function auditablePatch(patch: PersonPatch): Record<string, unknown> {
  const { requireNewPassword, ...rest } = patch;
  return { ...rest, ...(requireNewPassword ? { passwordReset: true } : {}) };
}
