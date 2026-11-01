import { describe, expect, it } from 'vitest';
import { fitMessage } from './fit-message';

describe('one WhatsApp message', () => {
  it('keeps everything when it fits', () => {
    expect(fitMessage(['a', 'b'], 'end', 'more')).toBe('a\nb\nend');
  });

  it('drops whole lines past the limit and says so', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `${index}`.padEnd(200, '.'));
    const text = fitMessage(lines, 'Links work for 72 hours.', 'More in the app.');
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toMatch(/\.\nMore in the app\.\nLinks work for 72 hours\.$/);
    const kept = text.split('\n').slice(0, -2);
    expect(kept.length).toBeGreaterThan(10);
    expect(kept.every((line, index) => line === lines[index])).toBe(true);
  });
});
