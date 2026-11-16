import {
  type DatabaseExecutor,
  locationConsents,
  personWorkSettings,
  reportingLines,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { consentIsCurrent, mayWatchPerson, trackingSwitchedOn } from '@oneohm/domain';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden } from '../../common/http/errors';
import { loadPolicy } from './policy';

/**
 * Who may watch whose duty day: the person, HR (`people.manage`) and the direct manager
 * (`mayWatchPerson`). The route reader and the live map both use these two functions.
 */
export async function assertMayWatch(
  db: DatabaseExecutor,
  actor: Actor,
  userId: string,
): Promise<void> {
  const [line] = await db
    .select({ manager: reportingLines.managerUserId })
    .from(reportingLines)
    .where(eq(reportingLines.userId, userId))
    .limit(1);
  const allowed = mayWatchPerson({
    viewerId: actor.userId,
    managesPeople: can(actor, 'people.manage'),
    personId: userId,
    personManagerId: line?.manager ?? null,
  });
  if (!allowed) throw forbidden();
}

export interface WatchedPerson {
  readonly id: string;
  readonly fullName: string;
  /**
   * For Call and WhatsApp. Everyone here is someone the caller already may reach: HR sees
   * phones on the people list, and a direct manager calls their own team. So it is given.
   */
  readonly phone: string | null;
  readonly designation: string | null;
  readonly avatarSwatch: number;
  readonly roleName: string | null;
  /**
   * Location switched on for them and consent to the current words. Without it nothing is
   * read from their route (no position, km, battery or mocked flag).
   */
  readonly locationOn: boolean;
}

/**
 * The people on the caller's live map: every active staff member for HR, else the caller's
 * own active direct reports. The caller is left out. Someone with neither the right nor
 * anyone reporting to them is refused (403). `locationOn` says whether their route may be read.
 */
export async function watchedPeople(db: DatabaseExecutor, actor: Actor): Promise<WatchedPerson[]> {
  const managesPeople = can(actor, 'people.manage');
  const lines = await db
    .select({ userId: reportingLines.userId, manager: reportingLines.managerUserId })
    .from(reportingLines);
  const managerOf = new Map(lines.map((line) => [line.userId, line.manager]));
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      phone: users.phoneE164,
      designation: users.designation,
      avatarSwatch: users.avatarSwatch,
      roleKey: roles.key,
      roleName: roles.name,
      roleKind: roles.kind,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(and(eq(users.status, 'active'), ne(users.id, actor.userId)))
    .orderBy(asc(users.fullName), asc(roles.name));
  const people = new Map<string, { row: (typeof rows)[number]; keys: string[]; staff: boolean }>();
  for (const row of rows) {
    const entry = people.get(row.id) ?? { row, keys: [], staff: false };
    entry.keys.push(row.roleKey);
    entry.staff ||= row.roleKind === 'staff';
    people.set(row.id, entry);
  }
  // Only active people count as reports (`people` holds active users only), as for the menu.
  const leadsSomeone = lines.some(
    (line) => line.manager === actor.userId && people.has(line.userId),
  );
  if (!managesPeople && !leadsSomeone) throw forbidden();
  const ids = [...people.values()]
    .filter(
      ({ row, staff }) =>
        staff &&
        mayWatchPerson({
          viewerId: actor.userId,
          managesPeople,
          personId: row.id,
          personManagerId: managerOf.get(row.id) ?? null,
        }),
    )
    .map(({ row }) => row.id);
  if (ids.length === 0) return [];
  const [policy, own, consents] = await Promise.all([
    loadPolicy(db),
    db
      .select({ userId: personWorkSettings.userId, tracking: personWorkSettings.tracking })
      .from(personWorkSettings)
      .where(inArray(personWorkSettings.userId, ids)),
    db.select().from(locationConsents).where(inArray(locationConsents.userId, ids)),
  ]);
  const ownTracking = new Map(own.map((row) => [row.userId, row.tracking]));
  return ids.flatMap((id) => {
    const entry = people.get(id);
    if (!entry) return [];
    const switchedOn = trackingSwitchedOn({
      company: policy.attendance.captureLocation,
      roleKeys: entry.keys,
      byRole: policy.attendance.trackingByRole,
      person: ownTracking.get(id) ?? null,
    });
    const { row } = entry;
    return [
      {
        id,
        fullName: row.fullName,
        phone: row.phone,
        designation: row.designation,
        avatarSwatch: row.avatarSwatch,
        roleName: row.roleName,
        locationOn:
          switchedOn && consentIsCurrent(consents.find((consent) => consent.userId === id) ?? null),
      },
    ];
  });
}
