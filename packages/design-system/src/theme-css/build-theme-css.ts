import { BRAND } from '../tokens/brand';
import {
  DARK_COLORS,
  LIGHT_COLORS,
  OCEAN_PANEL,
  PARTY_SWATCHES,
  PROJECT_SWATCHES,
} from '../tokens/colors';
import { BREAKPOINTS, DARK_ELEVATION, ELEVATION, RADIUS } from '../tokens/layout';
import { DURATION, EASING } from '../tokens/motion';
import { DARK_STATUS, LIGHT_STATUS, STATUS_TONES, type StatusColor } from '../tokens/status';
import { FONT_FAMILIES, TYPE_SCALE } from '../tokens/typography';
import { block, COLOR_CSS_NAMES, cubicBezier, kebab, px, rem } from './css-names';

type ThemeName = 'light' | 'dark';
type FontRole = keyof typeof FONT_FAMILIES;

const FONT_FALLBACKS: Readonly<Record<FontRole, string>> = {
  display: 'Georgia, "Times New Roman", serif',
  ui: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
};

/** CSS variable names that next/font (or any host) sets for the loaded faces. */
export const FONT_FACE_VARIABLES: Readonly<Record<FontRole, string>> = {
  display: '--font-face-display',
  ui: '--font-face-ui',
  mono: '--font-face-mono',
};

const TAILWIND_FONT_NAMES: Readonly<Record<FontRole, string>> = {
  display: 'display',
  ui: 'sans',
  mono: 'mono',
};

const PARTY_NAMES = Object.keys(PARTY_SWATCHES.light) as Array<keyof typeof PARTY_SWATCHES.light>;

function fontStack(role: FontRole): string {
  return `var(${FONT_FACE_VARIABLES[role]}), "${FONT_FAMILIES[role]}", ${FONT_FALLBACKS[role]}`;
}

function colorNames(): string[] {
  return Object.values(COLOR_CSS_NAMES);
}

function statusVariables(statuses: Readonly<Record<string, StatusColor>>): string[] {
  return STATUS_TONES.flatMap((tone) => {
    const color = statuses[tone];
    if (!color) return [];
    const name = kebab(tone);
    return [
      `--oh-${name}: ${color.fg};`,
      `--oh-${name}-tint: ${color.tint};`,
      `--oh-${name}-solid: ${color.solid};`,
    ];
  });
}

/** Runtime values for one theme. Only these change when the theme changes. */
function themeVariables(theme: ThemeName): string[] {
  const colors = theme === 'light' ? LIGHT_COLORS : DARK_COLORS;
  const statuses = theme === 'light' ? LIGHT_STATUS : DARK_STATUS;
  const shadows = theme === 'light' ? ELEVATION : DARK_ELEVATION;
  const parties = PARTY_SWATCHES[theme];
  return [
    `color-scheme: ${theme};`,
    ...Object.entries(COLOR_CSS_NAMES).map(
      ([token, name]) => `--oh-${name}: ${colors[token as keyof typeof colors]};`,
    ),
    ...statusVariables(statuses),
    ...PROJECT_SWATCHES[theme].map((swatch, index) => `--oh-swatch-${index}: ${swatch};`),
    ...PARTY_NAMES.map((party) => `--oh-party-${party}: ${parties[party]};`),
    ...Object.entries(shadows).map(([level, shadow]) => `--oh-shadow-${level}: ${shadow};`),
  ];
}

/** Tailwind theme entries that point at the runtime variables (`@theme inline`). */
function inlineThemeEntries(): string[] {
  const statusNames = STATUS_TONES.map(kebab).flatMap((name) => [
    name,
    `${name}-tint`,
    `${name}-solid`,
  ]);
  return [
    '--color-*: initial;',
    '--color-transparent: transparent;',
    '--color-current: currentColor;',
    ...colorNames().map((name) => `--color-${name}: var(--oh-${name});`),
    ...statusNames.map((name) => `--color-${name}: var(--oh-${name});`),
    ...PROJECT_SWATCHES.light.map((_, i) => `--color-swatch-${i}: var(--oh-swatch-${i});`),
    ...PARTY_NAMES.map((party) => `--color-party-${party}: var(--oh-party-${party});`),
    '--shadow-*: initial;',
    ...Object.keys(ELEVATION).map((level) => `--shadow-${level}: var(--oh-shadow-${level});`),
  ];
}

/** Values that never change with the theme. */
function staticThemeEntries(): string[] {
  const roles = Object.keys(FONT_FAMILIES) as FontRole[];
  return [
    ...roles.map((role) => `--font-${TAILWIND_FONT_NAMES[role]}: ${fontStack(role)};`),
    ...Object.entries(BRAND).map(([name, value]) => `--color-brand-${name}: ${value};`),
    ...Object.entries(RADIUS)
      .filter(([name]) => name !== 'full')
      .map(([name, value]) => `--radius-${name}: ${px(value)};`),
    ...Object.entries(EASING).map(
      ([name, points]) => `--ease-${kebab(name)}: ${cubicBezier(points)};`,
    ),
    ...Object.entries(BREAKPOINTS).map(([name, value]) => `--breakpoint-${name}: ${rem(value)};`),
    '--animate-shimmer: oh-shimmer 1.4s ease-in-out infinite;',
  ];
}

function durationVariables(collapsed: boolean): string[] {
  return Object.entries(DURATION).map(([name, value]) => {
    const effective = collapsed && name !== 'fade' ? 1 : value;
    return `--duration-${name}: ${effective}ms;`;
  });
}

function typeUtilities(): string[] {
  return Object.entries(TYPE_SCALE).map(([name, style]) =>
    block(`@utility type-${kebab(name)}`, [
      `font-family: var(--font-${TAILWIND_FONT_NAMES[style.family]});`,
      `font-size: ${rem(style.size)};`,
      `line-height: ${rem(style.lineHeight)};`,
      `font-weight: ${style.weight};`,
      `letter-spacing: ${style.tracking === '0' ? 'normal' : style.tracking};`,
    ]),
  );
}

/**
 * The whole web stylesheet for the design tokens: Tailwind v4 theme mapping,
 * light/dark runtime variables (system preference or `data-theme`), motion
 * durations (collapsed under reduced motion or `data-motion="calm"`) and one
 * `type-*` utility per type style. Written to dist/theme.css at build time.
 */
export function buildThemeCss(): string {
  const dark = themeVariables('dark');
  return [
    '/* Generated from packages/design-system/src/tokens by scripts/write-theme-css.mjs. Do not edit. */',
    block('@theme inline', inlineThemeEntries()),
    block('@theme', staticThemeEntries()),
    block(':root', [...themeVariables('light'), ...durationVariables(false)]),
    `@media (prefers-color-scheme: dark) {\n${block(":root:not([data-theme='light'])", dark, '  ')}\n}`,
    block(":root[data-theme='dark']", dark),
    block(
      '.oh-ocean',
      Object.entries(OCEAN_PANEL).map(
        ([token, value]) => `--oh-${COLOR_CSS_NAMES[token as keyof typeof OCEAN_PANEL]}: ${value};`,
      ),
    ),
    `@media (prefers-reduced-motion: reduce) {\n${block(':root', durationVariables(true), '  ')}\n}`,
    block(":root[data-motion='calm']", durationVariables(true)),
    block('@keyframes oh-shimmer', [
      'from { background-position: 150% 0; }',
      'to { background-position: -50% 0; }',
    ]),
    ...typeUtilities(),
    '',
  ].join('\n\n');
}
