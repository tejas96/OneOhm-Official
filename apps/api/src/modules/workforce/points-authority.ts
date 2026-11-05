import { type DatabaseExecutor, reportingLines, roles, userRoles } from '@oneohm/database';
import { mayDecidePoints, SUPER_ADMIN_ROLE_KEY } from '@oneohm/domain';
import { eq } from 'drizzle-orm';

/** Who reports to whom, and who is a Super Admin: what the points rule needs. */
export interface PointsAuthority {
  /** True when this person may decide the earner's points. */
  may(deciderUserId: string, earnerUserId: string): boolean;
}

export async function loadPointsAuthority(
  db: DatabaseExecutor,
  decider: { userId: string; roleKeys: readonly string[] },
): Promise<PointsAuthority> {
  const [lines, admins] = await Promise.all([
    db
      .select({ userId: reportingLines.userId, managerUserId: reportingLines.managerUserId })
      .from(reportingLines),
    db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(roles.key, SUPER_ADMIN_ROLE_KEY)),
  ]);
  const managers = new Map(lines.map((line) => [line.userId, line.managerUserId]));
  const superAdmins = new Set(admins.map((row) => row.userId));
  const deciderIsSuperAdmin = decider.roleKeys.includes(SUPER_ADMIN_ROLE_KEY);
  return {
    may: (deciderUserId, earnerUserId) =>
      mayDecidePoints({
        deciderUserId,
        deciderIsSuperAdmin: deciderUserId === decider.userId && deciderIsSuperAdmin,
        earnerUserId,
        earnerIsSuperAdmin: superAdmins.has(earnerUserId),
        managers,
      }),
  };
}
