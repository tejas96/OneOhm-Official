import { describe, expect, it } from 'vitest';
import { checkRemoval, newManagers } from './departure-rules';

const target = { id: 't', status: 'active' as const, kinds: ['staff' as const] };
const base = {
  actorId: 'admin',
  leaverId: 'leaver',
  target,
  lastWorkingDay: '2026-11-04',
  today: '2026-11-04',
};

describe('checkRemoval', () => {
  it('blocks removing yourself', () => {
    expect(checkRemoval({ ...base, actorId: 'leaver' })).toBe('remove_self');
  });

  it('blocks handing to the leaver', () => {
    expect(checkRemoval({ ...base, target: { ...target, id: 'leaver' } })).toBe('target_is_leaver');
  });

  it('blocks an inactive target', () => {
    expect(checkRemoval({ ...base, target: { ...target, status: 'inactive' } })).toBe(
      'target_not_active',
    );
  });

  it('blocks a reseller-only target', () => {
    expect(checkRemoval({ ...base, target: { ...target, kinds: ['reseller'] } })).toBe(
      'target_is_reseller',
    );
  });

  it('blocks a target with no staff role', () => {
    for (const kinds of [['partner'], ['partner', 'reseller']] as const) {
      expect(checkRemoval({ ...base, target: { ...target, kinds: [...kinds] } })).toBe(
        'target_not_staff',
      );
    }
    expect(
      checkRemoval({ ...base, target: { ...target, kinds: ['partner', 'staff'] } }),
    ).toBeNull();
  });

  it('blocks a future last day', () => {
    expect(checkRemoval({ ...base, lastWorkingDay: '2026-11-05' })).toBe('future_date');
  });

  it('allows today and earlier', () => {
    expect(checkRemoval(base)).toBeNull();
    expect(checkRemoval({ ...base, lastWorkingDay: '2026-10-01' })).toBeNull();
  });
});

describe('newManagers', () => {
  const input = { leaverId: 'leaver', targetId: 't', reportIds: ['a', 't'] };

  it('hands reports to the target and the target to the leaver manager', () => {
    expect(newManagers({ ...input, leaverManagerId: 'm' })).toEqual(
      new Map([
        ['a', 't'],
        ['t', 'm'],
      ]),
    );
  });

  it('leaves the target with no manager when the leaver had none', () => {
    expect(newManagers({ ...input, leaverManagerId: null }).get('t')).toBeNull();
  });

  it('never makes the target their own manager', () => {
    expect(newManagers({ ...input, leaverManagerId: 't' }).get('t')).toBeNull();
  });
});
