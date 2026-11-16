import { describe, expect, it, vi } from 'vitest';

vi.mock('./notify', () => ({ notifyCover: vi.fn(), notifyHolders: vi.fn() }));

import { alertNoticeKey, type DutyAlertInput, raiseDutyAlert } from './duty-alert-store';

/** A db where the insert hits the unique key and the existing row is `found`. */
function fakeDb(found: { id: string; resolvedAt: Date | null }) {
  const updates: Record<string, unknown>[] = [];
  const chain = (result: unknown) => {
    const link: Record<string, unknown> = {};
    for (const name of ['values', 'onConflictDoNothing', 'from', 'where']) link[name] = () => link;
    link.returning = async () => [];
    link.limit = async () => result;
    return link;
  };
  const db = {
    insert: () => chain([]),
    select: () => chain([found]),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        updates.push(value);
        return { where: async () => undefined };
      },
    }),
  };
  return { db: db as never, updates };
}

const input = (since?: Date): DutyAlertInput => ({
  kind: 'visit_missed',
  personId: 'p1',
  subjectType: 'task',
  subjectId: 't1',
  day: '2026-11-16',
  title: 'Sharma: nobody yet',
  body: 'Send the nearest person.',
  ...(since ? { since } : {}),
});
const closedAt = new Date('2026-11-16T06:00:00Z');

describe('raiseDutyAlert on an alert already there', () => {
  it('leaves a closed alert closed for a cause that began before it was closed', async () => {
    const { db, updates } = fakeDb({ id: 'a1', resolvedAt: closedAt });
    const result = await raiseDutyAlert(db, input(new Date('2026-11-16T05:30:00Z')));
    expect(result).toEqual({ id: 'a1', created: false });
    expect(updates).toHaveLength(0);
  });

  it('opens it again, quietly, for a cause that began after it was closed', async () => {
    const { db, updates } = fakeDb({ id: 'a1', resolvedAt: closedAt });
    const result = await raiseDutyAlert(db, input(new Date('2026-11-16T07:00:00Z')));
    expect(result).toEqual({ id: 'a1', created: false, reopened: true });
    expect(updates[0]).toMatchObject({ resolvedAt: null, resolvedBy: null, resolvedReason: null });
  });

  it('never opens one again without knowing when the cause began', async () => {
    const { db, updates } = fakeDb({ id: 'a1', resolvedAt: closedAt });
    expect((await raiseDutyAlert(db, input())).created).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

describe('alertNoticeKey', () => {
  it('keys a claim alert by the claim, so a cleared and remade alert tells nobody again', () => {
    const claim = {
      kind: 'claim_waiting',
      personId: 'p',
      subjectType: 'travel_claim',
      subjectId: 'c1',
    } as const;
    expect(alertNoticeKey({ ...claim, id: 'a1' })).toBe('duty_alert:claim_waiting:c1');
    expect(alertNoticeKey({ ...claim, id: 'a2' })).toBe('duty_alert:claim_waiting:c1');
  });

  it('keys any other alert by the alert', () => {
    expect(
      alertNoticeKey({
        id: 'a1',
        kind: 'fake_gps',
        personId: 'p',
        subjectType: 'person',
        subjectId: 'p',
      }),
    ).toBe('duty_alert:a1');
  });
});
