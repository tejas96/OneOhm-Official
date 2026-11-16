import type { Person } from '@oneohm/api-contracts';
import type { Actor } from '../../common/auth/actor';

/**
 * A person's home or base place is private: only people.manage holders and the person
 * themself see it. Everyone else gets the person without it.
 */
export function personFor(actor: Pick<Actor, 'userId' | 'capabilities'>, person: Person): Person {
  if (actor.capabilities.has('people.manage') || actor.userId === person.id) return person;
  const { base: _private, ...rest } = person;
  return rest;
}
