import { describe, expect, it } from 'vitest';
import { dayProgress, greetingPart, localHours, pointOnArc, skyPhase } from './sun-path';

describe('sun path', () => {
  it('reads the hour in the business timezone', () => {
    // 03:45 UTC is 09:15 in India.
    expect(localHours(new Date('2026-11-01T03:45:00Z'), 'Asia/Kolkata')).toBe(9.25);
  });

  it('names the part of the day', () => {
    expect(skyPhase(9.25)).toBe('morning');
    expect(skyPhase(13)).toBe('midday');
    expect(skyPhase(17)).toBe('evening');
    expect(skyPhase(21)).toBe('night');
    expect(skyPhase(5.5)).toBe('night');
  });

  it('words the greeting to fit the hour', () => {
    expect(greetingPart(2)).toBe('late');
    expect(greetingPart(4.99)).toBe('late');
    expect(greetingPart(5)).toBe('morning');
    expect(greetingPart(11.99)).toBe('morning');
    expect(greetingPart(12)).toBe('afternoon');
    expect(greetingPart(16.99)).toBe('afternoon');
    expect(greetingPart(17)).toBe('evening');
    expect(greetingPart(21.99)).toBe('evening');
    expect(greetingPart(22)).toBe('late');
    expect(greetingPart(0)).toBe('late');
  });

  it('runs from sunrise to sunset and stays on the arc', () => {
    expect(dayProgress(6)).toBe(0);
    expect(dayProgress(18.5)).toBe(1);
    expect(dayProgress(23)).toBe(1);
    expect(pointOnArc(0.5, [0, 100], [50, -100], [100, 100])).toEqual([50, 0]);
  });
});
