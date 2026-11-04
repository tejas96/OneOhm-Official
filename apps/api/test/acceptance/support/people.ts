import { rows } from './db';
import type { Session } from './http';
import { today, uniquePhone } from './sales';
import { ensurePerson } from './team';

/**
 * People a scenario owns: they hold a role no task template is given to by default
 * (HR), so other scenarios' new projects never pick them, and they are switched off when
 * the scenario ends. Work reaches them only when the scenario assigns it.
 */
export interface OwnPerson {
  id: string;
  phone: string;
  name: string;
}

export async function ownPerson(
  admin: Session,
  name: string,
  roles: readonly string[] = ['hr'],
): Promise<OwnPerson> {
  const phone = uniquePhone();
  const person = await ensurePerson(admin, { phone, name, roles });
  return { id: person.id, phone, name };
}

/** Remove from team, work handed to the admin, today; fails the test when refused. */
export async function removeNow(admin: Session, userId: string): Promise<void> {
  await admin.post(`/people/${userId}/remove`, {
    handToUserId: admin.userId,
    lastWorkingDay: today(),
    tellCustomers: false,
  });
}

/** A past member from before Remove from team: switched off, nothing handed over. */
export async function pastMemberAsBefore(userId: string): Promise<void> {
  await rows("UPDATE users SET status = 'inactive', left_on = current_date WHERE id = $1", [
    userId,
  ]);
}

/**
 * Removes the scenario's own people (work handed to the admin) so later projects never
 * assign them. Someone who cannot be removed (already gone, the last Super Admin) is skipped.
 */
export async function retire(admin: Session, people: readonly OwnPerson[]): Promise<void> {
  for (const person of people)
    await admin.raw('POST', `/people/${person.id}/remove`, {
      handToUserId: admin.userId,
      lastWorkingDay: today(),
      tellCustomers: false,
    });
}
