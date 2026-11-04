import type { Capability } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { archivedRolesNewlyGiven, rolesOutOfReach } from './role-grant';

const hr = new Set<Capability>(['people.manage', 'people.view', 'leave.approve']);
const sales = { id: 'r-sales', name: 'Sales', capabilities: ['people.view'] as Capability[] };
const superAdmin = {
  id: 'r-super',
  name: 'Super Admin',
  capabilities: ['people.manage', 'roles.manage', 'settings.manage'] as Capability[],
};

describe('rolesOutOfReach', () => {
  it('lets someone give a role whose permissions they already hold', () => {
    expect(rolesOutOfReach(hr, [sales])).toEqual([]);
  });

  it('stops someone giving a role with a permission they do not hold', () => {
    expect(rolesOutOfReach(hr, [sales, superAdmin])).toEqual(['Super Admin']);
  });

  it('lets someone who manages roles give any role', () => {
    const owner = new Set<Capability>([...hr, 'roles.manage']);
    expect(rolesOutOfReach(owner, [superAdmin])).toEqual([]);
  });
});

describe('archivedRolesNewlyGiven', () => {
  const field = { id: 'r-field', name: 'Field crew', archived: true };
  const office = { id: 'r-office', name: 'Office', archived: false };

  it('refuses giving an archived role to someone who does not hold it', () => {
    expect(archivedRolesNewlyGiven([field, office], new Set())).toEqual(['Field crew']);
  });

  it('lets someone keep an archived role they already hold', () => {
    expect(archivedRolesNewlyGiven([field, office], new Set(['r-field']))).toEqual([]);
  });
});
