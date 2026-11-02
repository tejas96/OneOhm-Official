import { describe, expect, it } from 'vitest';
import { pinLabel, pinOutcome, pinSavedMessage, shouldKeepPin } from './pin-flow';

const point = { latitude: 18.52, longitude: 73.85 };

describe('pinLabel', () => {
  it('asks to pin when the site has no point', () => {
    expect(pinLabel(null)).toBe('Pin the roof');
  });
  it('asks to move the pin when there is one', () => {
    expect(pinLabel(point)).toBe('Move the roof pin');
  });
});

describe('pinOutcome', () => {
  it('opens on the reading when there is one', () => {
    const start = { ...point, accuracyM: 6 };
    expect(pinOutcome(start, null)).toEqual({ open: true, start });
  });
  it('opens on the saved point when there is no reading', () => {
    expect(pinOutcome(null, point)).toEqual({ open: true, start: null });
  });
  it('cannot open with neither', () => {
    expect(pinOutcome(null, null)).toEqual({
      open: false,
      message: 'Share your location to pin the roof.',
    });
  });
});

describe('pinSavedMessage', () => {
  it('says pinned when within the limit', () => {
    expect(pinSavedMessage(false)).toBe('Roof pinned');
  });
  it('says the office will check a flagged pin', () => {
    expect(pinSavedMessage(true)).toBe('Roof pinned. The office will check it.');
  });
});

describe('shouldKeepPin', () => {
  it('keeps a pin that failed for want of signal', () => {
    expect(
      shouldKeepPin(Object.assign(new Error('Could not reach OneOhm.'), { code: 'network' })),
    ).toBe(true);
  });
  it('does not keep one the server refused', () => {
    expect(shouldKeepPin(Object.assign(new Error('No'), { code: 'site_located' }))).toBe(false);
  });
});
