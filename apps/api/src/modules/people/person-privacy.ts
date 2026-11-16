import type { Person } from '@oneohm/api-contracts';
import type { Actor } from '../../common/auth/actor';

/**
 * A person's home or base place is private: only people.manage holders and the person
 * themself see it. Monthly pay is for them, finance (who pay it) and the person themself.
 * Everyone else gets the person without these.
 */
export function personFor(actor: Pick<Actor, 'userId' | 'capabilities'>, person: Person): Person {
  const { capabilities } = actor;
  const self = actor.userId === person.id;
  const hr = capabilities.has('people.manage');
  const finance =
    capabilities.has('finance.approve_payments') || capabilities.has('finance.record_payments');
  const { base, monthlyPayPaise, ...rest } = person;
  return {
    ...rest,
    ...(hr || self ? { base } : {}),
    ...(hr || finance || self ? { monthlyPayPaise } : {}),
  };
}
