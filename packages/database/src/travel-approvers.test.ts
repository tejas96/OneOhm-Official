import { beforeEach, describe, expect, it, vi } from 'vitest';

const notices = vi.hoisted(() => ({
  notifyCover: vi.fn(async () => 1),
  notifyHolders: vi.fn(async () => 1),
  holdersOf: vi.fn(async (_db: unknown, right: string) => HOLDERS[right] ?? []),
}));
const HOLDERS: Record<string, string[]> = {
  'people.manage': ['hr1'],
  'finance.record_payments': ['fin1'],
  'finance.approve_payments': ['fin2', 'fin1'],
};
// Everyone is at work unless away (then nobody covers).
const away = new Set<string>();

vi.mock('./notify', () => notices);
vi.mock('./chat-answerer', () => ({
  answererFor: async (_db: unknown, id: string) => (away.has(id) ? 'cover' : id),
}));

import { managerIdsOf, tellClaimDeciders, travelReviewersOf } from './travel-approvers';

/** The db answers each select with the next rows queued. */
const dbWith = (...answers: unknown[][]) => {
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (resolve: (v: unknown[]) => void) => resolve(rows) : () => link(rows),
      },
    );
  return { select: () => link(answers.shift() ?? []) } as never;
};
const notice = { kind: 'travel_claim', title: 't', body: 'b', dedupeKey: 'k' };

beforeEach(() => {
  vi.clearAllMocks();
  away.clear();
});

describe('who hears of a new claim (S10)', () => {
  it('tells the manager first, through leave cover', async () => {
    await tellClaimDeciders(dbWith([{ managerId: 'boss' }]), 'worker', notice);
    expect(notices.notifyCover).toHaveBeenCalledWith(
      expect.anything(),
      'boss',
      'people.manage',
      notice,
    );
    expect(notices.notifyHolders).not.toHaveBeenCalled();
  });

  it('tells HR when the person has no manager', async () => {
    await tellClaimDeciders(dbWith([]), 'worker', notice);
    expect(notices.notifyHolders).toHaveBeenCalledWith(
      expect.anything(),
      'people.manage',
      notice,
      'worker',
    );
    expect(notices.notifyCover).not.toHaveBeenCalled();
  });

  it('falls back to finance when nobody holds the HR right', async () => {
    notices.notifyHolders.mockResolvedValueOnce(0);
    await tellClaimDeciders(dbWith([]), 'worker', notice);
    expect(notices.notifyHolders).toHaveBeenLastCalledWith(
      expect.anything(),
      'finance.record_payments',
      notice,
      'worker',
    );
  });
});

describe('who sees a claim in the approvals list (S10)', () => {
  it('lists the manager and the cover of an away manager', async () => {
    away.add('boss');
    const map = await managerIdsOf(
      dbWith([{ userId: 'worker', managerId: 'boss', status: 'active' }]),
      ['worker'],
    );
    expect(map.get('worker')).toEqual(['boss', 'cover']);
  });

  it('ignores a manager who has left', async () => {
    const map = await managerIdsOf(
      dbWith([{ userId: 'worker', managerId: 'boss', status: 'inactive' }]),
      ['worker'],
    );
    expect(map.has('worker')).toBe(false);
  });

  it('puts manager, then HR, then finance, once each, never the person', async () => {
    const reviewers = await travelReviewersOf(
      dbWith([{ userId: 'worker', managerId: 'boss', status: 'active' }]),
      ['worker'],
    );
    expect(reviewers.get('worker')).toEqual(['boss', 'hr1', 'fin1', 'fin2']);
  });

  it('a person who is HR is not in the list for their own claim', async () => {
    HOLDERS['people.manage'] = ['hr1', 'worker'];
    const reviewers = await travelReviewersOf(dbWith([]), ['worker']);
    HOLDERS['people.manage'] = ['hr1'];
    expect(reviewers.get('worker')).not.toContain('worker');
    expect(reviewers.get('worker')).toContain('hr1');
  });
});
