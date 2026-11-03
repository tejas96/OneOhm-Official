import { describe, expect, it, vi } from 'vitest';
import { createPendingPins } from './pending-pins';

const a = { latitude: 1, longitude: 2 };
const b = { latitude: 3, longitude: 4 };

describe('createPendingPins', () => {
  it('keeps the last pin per task and tells listeners', () => {
    const pins = createPendingPins();
    const listener = vi.fn();
    pins.subscribe(listener);
    pins.keep('t1', a);
    pins.keep('t1', b);
    expect(pins.get('t1')).toEqual(b);
    expect(pins.get('t2')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('drops only the pin that was sent, not a newer one', () => {
    const pins = createPendingPins();
    pins.keep('t1', b);
    pins.drop('t1', a);
    expect(pins.get('t1')).toEqual(b);
    pins.drop('t1', b);
    expect(pins.get('t1')).toBeNull();
  });
  it('stops telling a listener once it unsubscribes', () => {
    const pins = createPendingPins();
    const listener = vi.fn();
    const stop = pins.subscribe(listener);
    stop();
    pins.keep('t1', a);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('clear', () => {
  it('drops any pin for the task and tells listeners', () => {
    const pins = createPendingPins();
    const listener = vi.fn();
    pins.keep('t1', a);
    pins.subscribe(listener);
    pins.clear('t1');
    expect(pins.get('t1')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    pins.clear('t1');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
