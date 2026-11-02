import type { GeoPoint } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { createPendingPins } from './pending-pins';
import { createPinSender } from './pin-sender';

const A = { latitude: 1, longitude: 1 };
const B = { latitude: 2, longitude: 2 };
const offline = () => Object.assign(new Error('Could not reach OneOhm.'), { code: 'network' });

function deferred() {
  let resolve: (value: string) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const pins = createPendingPins();
  const sent: GeoPoint[] = [];
  const replies: ReturnType<typeof deferred>[] = [];
  const sender = createPinSender(pins, (_taskId, pin) => {
    sent.push(pin);
    const reply = deferred();
    replies.push(reply);
    return reply.promise;
  });
  return { pins, sent, replies, sender };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPinSender', () => {
  it('pending A, then B succeeds: A is never sent', async () => {
    const { pins, sent, replies, sender } = setup();
    pins.keep('t1', A);
    const confirmed = sender.confirm('t1', B);
    const resent = sender.resend('t1');
    await tick();
    replies[0]?.resolve('saved B');
    await expect(confirmed).resolves.toBe('saved B');
    await expect(resent).resolves.toEqual({ refused: null });
    expect(sent).toEqual([B]);
    expect(pins.get('t1')).toBeNull();
  });
  it('a re-send already in flight lands before the newer pin', async () => {
    const { pins, sent, replies, sender } = setup();
    pins.keep('t1', A);
    const resent = sender.resend('t1');
    await tick();
    expect(sent).toEqual([A]);
    const confirmed = sender.confirm('t1', B);
    await tick();
    expect(sent).toEqual([A]);
    replies[0]?.resolve('saved A');
    await resent;
    await tick();
    expect(sent).toEqual([A, B]);
    replies[1]?.resolve('saved B');
    await expect(confirmed).resolves.toBe('saved B');
    expect(pins.get('t1')).toBeNull();
  });
  it('keeps a confirmed pin that fails for want of signal', async () => {
    const { pins, replies, sender } = setup();
    const confirmed = sender.confirm('t1', B);
    await tick();
    replies[0]?.reject(offline());
    await expect(confirmed).rejects.toThrow('Could not reach OneOhm.');
    expect(pins.get('t1')).toEqual(B);
  });
  it('drops a re-sent pin the server refuses and hands back why', async () => {
    const { pins, replies, sender } = setup();
    pins.keep('t1', A);
    const resent = sender.resend('t1');
    await tick();
    const refusal = new Error('Check in at this site first.');
    replies[0]?.reject(refusal);
    await expect(resent).resolves.toEqual({ refused: refusal });
    expect(pins.get('t1')).toBeNull();
  });
  it('keeps a re-sent pin that still has no signal', async () => {
    const { pins, replies, sender } = setup();
    pins.keep('t1', A);
    const resent = sender.resend('t1');
    await tick();
    replies[0]?.reject(offline());
    await expect(resent).resolves.toEqual({ refused: null });
    expect(pins.get('t1')).toEqual(A);
  });
  it('clears the pending pin when another save works, after waiting its turn', async () => {
    const { pins, sender } = setup();
    pins.keep('t1', A);
    await expect(sender.exclusive('t1', async () => 'gps saved')).resolves.toBe('gps saved');
    expect(pins.get('t1')).toBeNull();
  });
});
