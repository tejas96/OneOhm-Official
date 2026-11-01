/** The same three faces as Lintel: an editorial serif, a precise sans, a technical mono. */
export const FONT_FAMILIES = {
  display: 'Newsreader',
  ui: 'Geist',
  mono: 'Geist Mono',
} as const;

export interface TypeStyle {
  readonly family: keyof typeof FONT_FAMILIES;
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: number;
  readonly tracking: string;
}

export const TYPE_SCALE: Readonly<Record<string, TypeStyle>> = {
  /** Hero figures: the one number a screen is about (collections, health score). */
  hero: { family: 'display', size: 72, lineHeight: 72, weight: 350, tracking: '-0.03em' },
  displayXl: { family: 'display', size: 56, lineHeight: 60, weight: 380, tracking: '-0.02em' },
  displayLg: { family: 'display', size: 40, lineHeight: 44, weight: 400, tracking: '-0.015em' },
  displayMd: { family: 'display', size: 28, lineHeight: 34, weight: 420, tracking: '-0.01em' },
  titleLg: { family: 'ui', size: 20, lineHeight: 28, weight: 600, tracking: '-0.01em' },
  titleMd: { family: 'ui', size: 16, lineHeight: 24, weight: 600, tracking: '-0.005em' },
  body: { family: 'ui', size: 15, lineHeight: 22, weight: 400, tracking: '0' },
  bodySm: { family: 'ui', size: 13, lineHeight: 20, weight: 400, tracking: '0' },
  label: { family: 'ui', size: 12, lineHeight: 16, weight: 500, tracking: '0.02em' },
  overline: { family: 'ui', size: 11, lineHeight: 16, weight: 600, tracking: '0.08em' },
  mono: { family: 'mono', size: 12, lineHeight: 16, weight: 400, tracking: '0' },
};
