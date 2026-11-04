import type { Departure, Person } from '@oneohm/api-contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  finishRemoval,
  handedOverCount,
  handOverCandidates,
  isPastMember,
  openWorkRows,
  presetTarget,
  settlementRows,
} from './departure';

const NO_WORK: Departure['counts'] = {
  leads: 0,
  tasks: 0,
  proposedTasks: 0,
  serviceRequests: 0,
  discomSteps: 0,
  managedProjects: 0,
  teamProjects: 0,
  directReports: 0,
  chats: 0,
  leaveApprovals: 0,
  backupFor: 0,
  ownPendingLeave: 0,
  commissionRules: 0,
};

const NOTHING_OWED: Departure['settlement'] = {
  travelClaims: { count: 0, paise: 0 },
  bonusShares: { count: 0, paise: 0 },
  payables: { count: 0, paise: 0 },
  commissions: { count: 0, paise: 0 },
  pendingPoints: 0,
};

const role = (kind: 'staff' | 'partner' | 'reseller') => ({
  id: `role-${kind}`,
  key: kind,
  name: kind,
  kind,
});

const person = (id: string, over: Partial<Person> = {}): Person =>
  ({
    id,
    fullName: id,
    status: 'active',
    roles: [role('staff')],
    leftOn: null,
    ...over,
  }) as Person;

describe('openWorkRows', () => {
  it('lists only the kinds of work they still hold, in the sheet order', () => {
    expect(openWorkRows({ ...NO_WORK, tasks: 4, leads: 12, chats: 1 })).toEqual([
      { key: 'leads', count: 12 },
      { key: 'tasks', count: 4 },
      { key: 'chats', count: 1 },
    ]);
  });

  it('is empty when nothing is open', () => {
    expect(openWorkRows(NO_WORK)).toEqual([]);
  });
});

describe('handedOverCount', () => {
  it('counts what moves to the new person, not leave cancelled or rules kept on', () => {
    expect(
      handedOverCount({
        ...NO_WORK,
        leads: 12,
        tasks: 4,
        directReports: 2,
        ownPendingLeave: 1,
        commissionRules: 3,
      }),
    ).toBe(18);
  });
});

describe('settlementRows', () => {
  it('lists only what is still owed, money with its total', () => {
    expect(
      settlementRows({
        ...NOTHING_OWED,
        travelClaims: { count: 2, paise: 184_000 },
        bonusShares: { count: 1, paise: 500_000 },
        pendingPoints: 40,
      }),
    ).toEqual([
      { key: 'travelClaims', count: 2, paise: 184_000 },
      { key: 'bonusShares', count: 1, paise: 500_000 },
      { key: 'pendingPoints', count: 40, paise: null },
    ]);
  });

  it('is empty when nothing is owed', () => {
    expect(settlementRows(NOTHING_OWED)).toEqual([]);
  });
});

describe('handOverCandidates', () => {
  it('offers active staff only: not the leaver, past members or resellers', () => {
    const people = [
      person('leaver'),
      person('ravi'),
      person('gone', { status: 'inactive', leftOn: '2026-10-03' }),
      person('reseller', { roles: [role('reseller')] }),
      person('crew', { roles: [role('partner')] }),
      person('mixed', { roles: [role('reseller'), role('staff')] }),
      person('no-role', { roles: [] }),
    ];
    expect(handOverCandidates(people, 'leaver').map((entry) => entry.id)).toEqual([
      'ravi',
      'mixed',
    ]);
  });
});

describe('presetTarget', () => {
  const candidates = [person('ravi'), person('meena')];

  it('uses the suggested person when they can take the work', () => {
    expect(presetTarget(candidates, 'meena')).toBe('meena');
  });

  it('leaves the picker empty when there is no usable suggestion', () => {
    expect(presetTarget(candidates, null)).toBeUndefined();
    expect(presetTarget(candidates, 'someone-else')).toBeUndefined();
  });
});

describe('isPastMember', () => {
  it('is anyone removed from the team', () => {
    expect(isPastMember(person('a', { status: 'inactive' }))).toBe(true);
    expect(isPastMember(person('b'))).toBe(false);
  });
});

describe('finishRemoval', () => {
  it('confirms and closes before refreshing, so the sheet never shows the emptied summary', async () => {
    const order: string[] = [];
    await finishRemoval({
      confirm: () => order.push('toast'),
      close: () => order.push('close'),
      refresh: vi.fn(async () => {
        order.push('refresh');
      }),
    });
    expect(order).toEqual(['toast', 'close', 'refresh']);
  });
});
