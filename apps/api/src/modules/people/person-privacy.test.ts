import type { Person } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { personFor } from './person-privacy';

const person = {
  id: 'p1',
  fullName: 'Ravi',
  base: { latitude: 16.8, longitude: 74.5, label: 'Home' },
} as unknown as Person;
const actor = (userId: string, ...capabilities: string[]) =>
  ({ userId, capabilities: new Set(capabilities) }) as never;

describe('personFor (the home place is private)', () => {
  it.each(['tasks.assign', 'projects.manage', 'people.view'])(
    'leaves the base out for a %s holder',
    (capability) => {
      const seen = personFor(actor('boss', capability), person);
      expect(seen.base).toBeUndefined();
      expect(seen.fullName).toBe('Ravi');
    },
  );

  it('shows it to a people.manage holder and to the person themself', () => {
    expect(personFor(actor('hr', 'people.manage'), person).base).toEqual(person.base);
    expect(personFor(actor('p1'), person).base).toEqual(person.base);
  });
});
