import type { Role } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { archiveNeedsConfirm, undoOf } from './role-changes';

const role = { id: 'r-sales', name: 'Sales', archived: false, memberCount: 3 } as Role;

describe('archiveNeedsConfirm', () => {
  it('asks before archiving a role people hold', () => {
    expect(archiveNeedsConfirm(role, true)).toBe(true);
  });

  it('does not ask when nobody holds it, when it is already archived, or when not archiving', () => {
    expect(archiveNeedsConfirm({ ...role, memberCount: 0 }, true)).toBe(false);
    expect(archiveNeedsConfirm({ ...role, archived: true }, true)).toBe(false);
    expect(archiveNeedsConfirm(role, false)).toBe(false);
    expect(archiveNeedsConfirm(null, true)).toBe(false);
  });
});

describe('undoOf', () => {
  it('offers to give back a permission just taken away', () => {
    expect(undoOf({ role, capability: 'leads.manage', grant: false })).toEqual({
      role,
      capability: 'leads.manage',
      grant: true,
    });
  });

  it('offers nothing after a permission is given', () => {
    expect(undoOf({ role, capability: 'leads.manage', grant: true })).toBeNull();
  });
});
