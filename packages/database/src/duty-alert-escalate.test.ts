import { describe, expect, it, vi } from 'vitest';

const sent: { userId: string; title: string; kind: string; dedupeKey: string }[] = [];
vi.mock('./notify', () => ({
  notify: async (
    _db: unknown,
    to: { userId: string },
    notice: { title: string; kind: string; dedupeKey: string },
  ) => {
    sent.push({ userId: to.userId, ...notice });
  },
}));

import { escalateDutyAlerts } from './duty-alert-escalate';

const dbWith = (rows: { personId: string; raisedOn: string }[]) => {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'from']) chain[name] = () => chain;
  chain.where = async () => rows;
  return chain as never;
};

describe('escalateDutyAlerts', () => {
  it('sends each owner one digest, not one notice per alert, leaving out their own alerts', async () => {
    sent.length = 0;
    const rows = [
      ...Array.from({ length: 6 }, () => ({ personId: 'ravi', raisedOn: '2026-11-15' })),
      { personId: 'owner-a', raisedOn: '2026-11-15' },
    ];
    expect(
      await escalateDutyAlerts(dbWith(rows), '2026-11-16', ['owner-a', 'owner-b'], 'Asia/Kolkata'),
    ).toBe(2);
    expect(sent).toEqual([
      expect.objectContaining({
        userId: 'owner-a',
        title: '6 field alerts from yesterday still open',
        kind: 'duty_alerts_digest',
        dedupeKey: 'duty_alerts_digest:2026-11-16:owner-a',
      }),
      expect.objectContaining({
        userId: 'owner-b',
        title: '7 field alerts from yesterday still open',
      }),
    ]);
  });

  it('says the last 2 days when some are older than yesterday, and stays quiet with none', async () => {
    sent.length = 0;
    const rows = [
      { personId: 'ravi', raisedOn: '2026-11-14' },
      { personId: 'ravi', raisedOn: '2026-11-15' },
    ];
    await escalateDutyAlerts(dbWith(rows), '2026-11-16', ['owner'], 'Asia/Kolkata');
    expect(sent[0]?.title).toBe('2 field alerts from the last 2 days still open');
    sent.length = 0;
    expect(await escalateDutyAlerts(dbWith([]), '2026-11-16', ['owner'], 'Asia/Kolkata')).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
