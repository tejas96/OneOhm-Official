import type { Session } from './http';
import { uniquePhone } from './sales';
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

/** Switches the scenario's own people off so later projects never assign them. */
export async function retire(admin: Session, people: readonly OwnPerson[]): Promise<void> {
  for (const person of people) await admin.patch(`/people/${person.id}`, { status: 'inactive' });
}
