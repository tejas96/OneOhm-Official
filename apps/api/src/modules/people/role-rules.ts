const nameKey = (name: string) => name.trim().toLowerCase();

/** Whether another active role already uses this name (capitals and spaces do not count). */
export function roleNameTaken(
  roleId: string,
  name: string,
  roles: readonly { id: string; name: string; archived: boolean }[],
): boolean {
  return roles.some(
    (role) => role.id !== roleId && !role.archived && nameKey(role.name) === nameKey(name),
  );
}

/** The archive date after a save: archiving again keeps the day it was first archived. */
export function archivedAtAfter(
  current: Date | null,
  archived: boolean | undefined,
  now: Date,
): Date | null {
  if (archived === undefined) return current;
  if (!archived) return null;
  return current ?? now;
}
