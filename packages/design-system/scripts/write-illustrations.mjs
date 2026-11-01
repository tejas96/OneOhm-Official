#!/usr/bin/env node
// Writes the Lottie illustrations (src/illustrations/*.json) from simple shapes in the
// light palette; dark mode swaps each colour for its dark token at runtime, and glows are
// translucent so they read on any surface. Calm motion: success moments play once in at
// most 1.2 s, empty states breathe in a slow loop.
// Run after `pnpm --filter @oneohm/design-system build` (it reads dist/tokens).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as k from './lottie-kit.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { LIGHT_COLORS: C, PARTY_SWATCHES } = require(join(root, 'dist/tokens/index.js'));
const GOLD = PARTY_SWATCHES.light.customer;
const { ellipse: circle, fill, group, layer, path, pts, ramp, rect, rise, scale, stroke } = k;

/** One shape layer; `t` holds its anchor and any animated transform. */
const shape =
  (name, items, t = {}) =>
  (index, frames) =>
    layer(index, name, items, t, frames);
const pop = (from) => scale(`${from}:0 ${from + 14}:108 ${from + 24}:100`);
const breathe = (low, high) => scale(`0:${low} 120:${high} 240:${low}`, k.EASE.inOut);

/** A check drawn inside a ring over a soft disc (task done, saved). */
const success = k.animation('success', 60, [
  shape('check', [
    group(
      'check',
      path(pts('41 61, 54 74, 80 47')),
      k.trim(ramp('22:0 48:100')),
      stroke(C.energy, 7),
    ),
  ]),
  shape('ring', [
    group(
      'ring',
      circle(60, 60, 84),
      k.trim(ramp('4:0 34:100', k.EASE.standard)),
      stroke(C.energy, 4),
    ),
  ]),
  shape('disc', [group('disc', circle(60, 60, 84), fill(C.energy, 16))], {
    anchor: [60, 60],
    s: scale('0:70 24:100'),
    o: ramp('0:0 12:100'),
  }),
]);

/** A banknote settles in and a small check badge pops on its corner (payment recorded). */
const payment = k.animation('payment', 60, [
  shape('tick', [
    group(
      'tick',
      path(pts('79.5 42, 84 46.5, 92.5 37.5')),
      k.trim(ramp('30:0 52:100')),
      stroke(C.surfaceRaised, 3.5),
    ),
  ]),
  shape('badge', [group('badge', circle(86, 42, 28), fill(C.energy))], {
    anchor: [86, 42],
    s: pop(18),
  }),
  shape(
    'note',
    [
      group('marks', circle(32, 66, 5), circle(76, 66, 5), fill(C.accent)),
      group('coin', circle(54, 66, 14), stroke(C.accent, 3)),
      group('paper', rect(54, 66, 66, 44, 8), stroke(C.accent, 3), fill(C.accentSoft)),
    ],
    { anchor: [54, 66], p: rise(54, '0:76 26:66'), o: ramp('0:0 14:100') },
  ),
]);

/** A star turns into place with three small sparkles (points and badges earned). */
const sparkle = (name, x, y, size, colour, from) =>
  shape(name, [group(name, circle(x, y, size), fill(colour))], { anchor: [x, y], s: pop(from) });
const reward = k.animation('reward', 66, [
  sparkle('spark-1', 24, 36, 7, C.accent, 16),
  sparkle('spark-2', 97, 30, 6, C.energy, 22),
  sparkle('spark-3', 100, 86, 8, C.accent, 28),
  shape('star', [group('star', path(k.starPoints(60, 62, 32, 14), true), fill(GOLD))], {
    anchor: [60, 62],
    s: scale('0:40 24:106 38:100'),
    r: ramp('0:-14 32:0'),
    o: ramp('0:0 10:100'),
  }),
  shape('halo', [group('halo', circle(60, 62, 80), fill(C.accent, 16))], {
    anchor: [60, 62],
    s: scale('0:80 26:100'),
    o: ramp('0:0 16:100'),
  }),
]);

/** A sun over the horizon, its rays turning slowly (nothing to do today). */
const rays = Array.from({ length: 8 }, (_, index) => {
  const angle = (index * Math.PI) / 4;
  const at = (r) =>
    [60 + r * Math.cos(angle), 54 + r * Math.sin(angle)].map((v) => Math.round(v * 100) / 100);
  return path([at(25), at(32)]);
});
const clearDay = k.animation('clear-day', 240, [
  shape('rays', [group('rays', ...rays, stroke(GOLD, 4))], {
    anchor: [60, 54],
    r: ramp('0:0 240:45', k.EASE.linear),
  }),
  shape('sun', [group('sun', circle(60, 54, 34), fill(GOLD))], {
    anchor: [60, 54],
    s: breathe(100, 104),
  }),
  shape('halo', [group('halo', circle(60, 54, 66), fill(C.accent, 14))], {
    anchor: [60, 54],
    s: breathe(94, 104),
  }),
  shape('ground', [
    group(
      'ground',
      path(pts('22 96, 98 96')),
      path(pts('40 104, 80 104')),
      stroke(C.borderStrong, 3),
    ),
  ]),
]);

/** A paper floats gently out of an open folder (no files yet). */
const lines = [pts('47 42, 73 42'), pts('47 50, 73 50'), pts('47 58, 65 58')].map((line) =>
  path(line),
);
const emptyFolder = k.animation('empty-folder', 210, [
  shape('front', [group('front', rect(60, 80, 84, 36, 6), fill(C.accent))]),
  shape(
    'paper',
    [
      group('lines', ...lines, stroke(C.borderStrong, 3)),
      group('sheet', rect(60, 58, 48, 54, 4), stroke(C.borderStrong, 2), fill(C.surfaceRaised)),
    ],
    { anchor: [60, 58], p: rise(60, '0:58 105:53 210:58', k.EASE.inOut) },
  ),
  shape('back', [
    group(
      'back',
      path(pts('18 34, 46 34, 52 40, 102 40, 102 98, 18 98'), true),
      fill(C.accentSoft),
    ),
  ]),
]);

const out = join(root, 'src/illustrations');
const all = { success, payment, reward, 'clear-day': clearDay, 'empty-folder': emptyFolder };
const files = Object.entries(all).map(([name, data]) => {
  const file = join(out, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(data)}\n`);
  console.info(`Wrote ${file} (${JSON.stringify(data).length} bytes minified)`);
  return file;
});
// Biome's layout for the JSON files, so `biome check` stays clean.
execFileSync('npx', ['biome', 'format', '--write', ...files], { cwd: root, stdio: 'inherit' });
