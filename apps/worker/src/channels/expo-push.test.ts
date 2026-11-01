import { describe, expect, it } from 'vitest';
import { expoRequestBody, readTickets } from './expo-push';

describe('Expo push', () => {
  it('sends one message per phone with the alert data', () => {
    const body = expoRequestBody({
      tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
      title: 'New task for you',
      body: 'Site survey · OH-2026-001',
      data: { notificationId: 'n1' },
    });
    expect(body).toHaveLength(2);
    expect(body[1]).toMatchObject({ to: 'ExponentPushToken[b]', title: 'New task for you' });
    expect(body[0]?.data).toEqual({ notificationId: 'n1' });
  });

  it('marks a removed app as gone and keeps other errors', () => {
    const tickets = readTickets(
      ['t1', 't2', 't3'],
      [
        { status: 'ok', id: 'x' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
      ],
    );
    expect(tickets[0]).toEqual({ token: 't1', ok: true, id: 'x' });
    expect(tickets[1]).toMatchObject({ ok: false, gone: true });
    expect(tickets[2]).toMatchObject({ ok: false, gone: false, error: 'too big' });
  });
});
