import { describe, expect, it } from 'vitest';
import { greetingPart } from './sun-path';

describe('greeting part', () => {
  it('fits the words to the hour', () => {
    expect(greetingPart(2)).toBe('late');
    expect(greetingPart(5)).toBe('morning');
    expect(greetingPart(12)).toBe('afternoon');
    expect(greetingPart(17)).toBe('evening');
    expect(greetingPart(22)).toBe('late');
  });
});
