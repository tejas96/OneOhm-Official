import type { Person } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { auditablePatch } from './person-fields';
import { personFor } from './person-privacy';

const person = {
  id: 'p1',
  fullName: 'Ravi',
  base: { latitude: 16.8, longitude: 74.5, label: 'Home' },
  monthlyPayPaise: 2_500_000,
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

describe('personFor (monthly pay is private)', () => {
  it.each(['tasks.assign', 'projects.manage', 'people.view', 'finance.view'])(
    'leaves the pay out for a %s holder',
    (capability) => {
      expect(personFor(actor('boss', capability), person)).not.toHaveProperty('monthlyPayPaise');
    },
  );

  it.each(['people.manage', 'finance.approve_payments', 'finance.record_payments'])(
    'shows it to a %s holder',
    (capability) => {
      expect(personFor(actor('hr', capability), person).monthlyPayPaise).toBe(2_500_000);
    },
  );

  it('shows it to the person themself, and finance never sees the home place', () => {
    expect(personFor(actor('p1'), person).monthlyPayPaise).toBe(2_500_000);
    expect(personFor(actor('f', 'finance.approve_payments'), person)).not.toHaveProperty('base');
  });
});

describe('auditablePatch (pay is never written to the log)', () => {
  it('says pay changed only when it did, never the amount', () => {
    expect(auditablePatch({ monthlyPayPaise: 2_500_000 }, true)).toEqual({
      monthlyPayChanged: true,
    });
    expect(auditablePatch({ monthlyPayPaise: 2_500_000 }, false)).toEqual({});
  });
});
