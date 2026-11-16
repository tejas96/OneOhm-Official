import { describe, expect, it, vi } from 'vitest';
import { createFenceQueue, parseFences, type QueuedFence } from './fence-queue';
import { asLeaveReason, jobHref, noticeIsFresh, opensToday, reasonFrom } from './fence-text';

const fence = (patch: Partial<QueuedFence> = {}): QueuedFence => ({
  userId: 'u1',
  kind: 'enter',
  siteId: 't1',
  service: false,
  label: 'Sharma home',
  eventAt: '2026-11-16T05:12:00.000Z',
  position: { latitude: 16.85, longitude: 74.58, accuracyM: 20 },
  mocked: false,
  ...patch,
});
const memory = () => {
  let saved: QueuedFence[] = [];
  return {
    load: async () => saved,
    save: async (items: readonly QueuedFence[]) => {
      saved = [...items];
    },
  };
};

describe('the fence queue', () => {
  it('sends a person own events in order and only theirs', async () => {
    const queue = createFenceQueue(memory());
    await queue.add(fence());
    await queue.add(fence({ userId: 'u2', siteId: 'other' }));
    await queue.add(fence({ kind: 'exit' }));
    const sent: string[] = [];
    const result = await queue.flush(
      async (item) => void sent.push(`${item.kind}:${item.siteId}`),
      'u1',
    );
    expect(sent).toEqual(['enter:t1', 'exit:t1']);
    expect(result.sent).toBe(2);
    expect(queue.get()).toHaveLength(1);
  });

  it('keeps an event that met no signal, and counts a 409 as already done', async () => {
    const queue = createFenceQueue(memory());
    await queue.add(fence());
    const offline = vi.fn().mockRejectedValue(new Error('network'));
    expect((await queue.flush(offline, 'u1')).sent).toBe(0);
    expect(queue.get()).toHaveLength(1);
    const twice = vi.fn().mockRejectedValue({ status: 409 });
    await queue.flush(twice, 'u1');
    expect(queue.get()).toHaveLength(0);
  });

  it('drops a refused event after reporting it', async () => {
    const queue = createFenceQueue(memory());
    await queue.add(fence());
    const result = await queue.flush(vi.fn().mockRejectedValue({ status: 422 }), 'u1');
    expect(result.refused).toHaveLength(1);
    expect(queue.get()).toHaveLength(0);
  });
});

describe('parseFences', () => {
  it('keeps well-formed events and drops the rest', () => {
    expect(parseFences([fence(), { kind: 'enter' }, null, 'x'])).toHaveLength(1);
    expect(parseFences('nope')).toEqual([]);
  });
  it('reads the mocked flag, false when missing, and keeps a null position', () => {
    const { mocked: _m, ...old } = fence({ position: null });
    expect(parseFences([old])[0]).toMatchObject({ mocked: false, position: null });
    expect(parseFences([fence({ mocked: true })])[0]?.mocked).toBe(true);
  });
});

describe('notice helpers', () => {
  it('reads a button id as a reason only when it is one', () => {
    expect(asLeaveReason('need_material')).toBe('need_material');
    expect(asLeaveReason('expo.modules.notifications.actions.DEFAULT')).toBeNull();
  });
  it('announces only fresh events', () => {
    const now = new Date('2026-11-16T06:00:00Z').getTime();
    expect(noticeIsFresh('2026-11-16T05:12:00Z', now)).toBe(true);
    expect(noticeIsFresh('2026-11-16T02:00:00Z', now)).toBe(false);
  });
});

describe('reasonFrom', () => {
  const response = (actionIdentifier: string, data: unknown) => ({
    actionIdentifier,
    notification: { request: { identifier: 'n1', content: { data } } },
  });
  const asked = {
    kind: 'site_left_ask',
    subjectType: 'task',
    subjectId: 't1',
    visitId: 'v1',
  };

  it('takes the reason of a button on the "why?" notice', () => {
    expect(reasonFrom(response('customer_not_home', asked))).toMatchObject({
      id: 'n1',
      reason: 'customer_not_home',
      data: { visitId: 'v1' },
    });
  });

  it('ignores a plain tap, another notice, and a notice with no visit', () => {
    expect(reasonFrom(response('expo.modules.notifications.actions.DEFAULT', asked))).toBeNull();
    expect(reasonFrom(response('need_material', { ...asked, kind: 'site_entered' }))).toBeNull();
    expect(reasonFrom(response('need_material', { ...asked, visitId: undefined }))).toBeNull();
    expect(reasonFrom(response('need_material', null))).toBeNull();
  });

  it('opens the task, or the service request', () => {
    expect(jobHref({ subjectType: 'task', subjectId: 't1' })).toEqual({
      pathname: '/tasks/[id]',
      params: { id: 't1' },
    });
    expect(jobHref({ subjectType: 'service_request', subjectId: 's1' }).pathname).toBe(
      '/service/[id]',
    );
  });
});

describe('opensToday', () => {
  const tap = (data: unknown, actionIdentifier = 'expo.modules.notifications.actions.DEFAULT') => ({
    actionIdentifier,
    notification: { request: { content: { data } } },
  });
  it('is a tap on the near-two-sites or by-hand notice only', () => {
    expect(opensToday(tap({ kind: 'site_near' }))).toBe(true);
    expect(opensToday(tap({ kind: 'site_by_hand' }))).toBe(true);
    expect(opensToday(tap({ kind: 'site_entered' }))).toBe(false);
    expect(opensToday(tap(null))).toBe(false);
  });
});
