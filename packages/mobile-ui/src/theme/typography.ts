import { TYPE_SCALE, type TypeStyle } from '@oneohm/design-system/tokens';
import type { TextStyle } from 'react-native';
import { fontFaceFor } from './fonts';

export const TEXT_VARIANTS = [
  'hero',
  'displayXl',
  'displayLg',
  'displayMd',
  'titleLg',
  'titleMd',
  'body',
  'bodySm',
  'label',
  'overline',
  'mono',
] as const;

export type TextVariant = (typeof TEXT_VARIANTS)[number];

/** Phones get the editorial scale one step smaller than the web. */
const PHONE_SIZE: Partial<Record<TextVariant, { size: number; lineHeight: number }>> = {
  hero: { size: 52, lineHeight: 54 },
  displayXl: { size: 40, lineHeight: 44 },
  displayLg: { size: 32, lineHeight: 36 },
};

/** Token tracking is in em ("-0.02em"); React Native wants points. */
function letterSpacingFor(tracking: string, size: number): number {
  const value = Number.parseFloat(tracking);
  if (!Number.isFinite(value)) return 0;
  return tracking.endsWith('em') ? Math.round(value * size * 100) / 100 : value;
}

function toTextStyle(variant: TextVariant, style: TypeStyle | undefined): TextStyle {
  if (!style) throw new Error(`Type token "${variant}" is missing from the design system.`);
  const size = PHONE_SIZE[variant]?.size ?? style.size;
  const lineHeight = PHONE_SIZE[variant]?.lineHeight ?? style.lineHeight;
  return {
    fontFamily: fontFaceFor(style.family, style.weight),
    fontSize: size,
    lineHeight,
    letterSpacing: letterSpacingFor(style.tracking, size),
    ...(variant === 'overline' ? { textTransform: 'uppercase' as const } : {}),
    ...(variant === 'mono' || style.family === 'display'
      ? { fontVariant: ['tabular-nums' as const] }
      : {}),
  };
}

export const TEXT_STYLES: Readonly<Record<TextVariant, TextStyle>> = Object.fromEntries(
  TEXT_VARIANTS.map((variant) => [variant, toTextStyle(variant, TYPE_SCALE[variant])]),
) as Record<TextVariant, TextStyle>;

/** Large display sizes stop growing early so headlines never wrap into chaos. */
export const MAX_FONT_SCALE: Readonly<Record<TextVariant, number>> = {
  hero: 1.1,
  displayXl: 1.15,
  displayLg: 1.2,
  displayMd: 1.3,
  titleLg: 1.5,
  titleMd: 1.6,
  body: 1.8,
  bodySm: 1.8,
  label: 1.6,
  overline: 1.4,
  mono: 1.6,
};

export const ITALIC_DISPLAY_FACE = fontFaceFor('display', 400, true);
