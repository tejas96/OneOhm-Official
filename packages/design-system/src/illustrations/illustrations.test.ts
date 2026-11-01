import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  colourHex,
  DARK_SWAPS,
  durationMs,
  ILLUSTRATIONS,
  type IllustrationName,
  type LottieAnimation,
  themeAnimation,
} from './index';

const FILES: Readonly<Record<IllustrationName, string>> = {
  success: 'success.json',
  payment: 'payment.json',
  reward: 'reward.json',
  clearDay: 'clear-day.json',
  emptyFolder: 'empty-folder.json',
};

const read = (name: IllustrationName): LottieAnimation =>
  JSON.parse(readFileSync(join(__dirname, FILES[name]), 'utf8')) as LottieAnimation;

/** Every still fill and stroke colour in the animation, as hex. */
function coloursOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) coloursOf(item, found);
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ((record.ty === 'fl' || record.ty === 'st') && record.c) {
      found.add(colourHex((record.c as { k: number[] }).k));
    }
    for (const inner of Object.values(record)) coloursOf(inner, found);
  }
  return found;
}

const names = Object.keys(FILES) as IllustrationName[];

describe('illustrations', () => {
  it.each(names)('%s stays small: under 6 KB minified', (name) => {
    expect(JSON.stringify(read(name)).length).toBeLessThan(6 * 1024);
  });

  it.each(names)('%s uses only palette colours that have a dark counterpart', (name) => {
    const colours = coloursOf(read(name));
    expect(colours.size).toBeGreaterThan(0);
    for (const colour of colours) expect(DARK_SWAPS.has(colour)).toBe(true);
  });

  it('plays success moments once, in at most 1.2 s', () => {
    for (const name of names.filter((candidate) => !ILLUSTRATIONS[candidate].loop)) {
      expect(durationMs(read(name))).toBeLessThanOrEqual(1200);
    }
  });

  it('loops only the empty states, slowly (at least 3 s a cycle)', () => {
    const loops = names.filter((name) => ILLUSTRATIONS[name].loop);
    expect(loops).toEqual(['clearDay', 'emptyFolder']);
    for (const name of loops) expect(durationMs(read(name))).toBeGreaterThanOrEqual(3000);
  });
});

describe('themeAnimation', () => {
  it('keeps the light animation as authored', () => {
    const animation = read('success');
    expect(themeAnimation(animation, 'light')).toBe(animation);
  });

  it('swaps every colour for its dark token and leaves the original alone', () => {
    const animation = read('payment');
    const before = JSON.stringify(animation);
    const dark = themeAnimation(animation, 'dark');
    const darkColours = coloursOf(dark);
    expect(darkColours).toEqual(new Set([...coloursOf(animation)].map((c) => DARK_SWAPS.get(c))));
    expect(JSON.stringify(animation)).toBe(before);
    expect(themeAnimation(animation, 'dark')).toBe(dark);
  });

  it('reads a Lottie colour as hex', () => {
    expect(colourHex([0.247, 0.604, 0.271, 1])).toBe('#3F9A45');
    expect(colourHex([1, 1, 1])).toBe('#FFFFFF');
  });
});
