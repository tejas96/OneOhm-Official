/**
 * "Daylight & Ohm" colour tokens. Text tokens reach WCAG AA (4.5:1) on every
 * surface of their theme; graphic solids reach 3:1. See docs/DESIGN_SYSTEM.md.
 */
export interface ThemeColors {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly borderSubtle: string;
  readonly borderStrong: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textTertiary: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentPressed: string;
  readonly onAccent: string;
  readonly accentSoft: string;
  readonly onAccentSoft: string;
  /** Logo green for energy and "generated" moments (graphics, not body text). */
  readonly energy: string;
  readonly energySoft: string;
  readonly focusRing: string;
  readonly scrim: string;
  /** The deep "solar glass" ground for the one hero moment per screen. */
  readonly panel: string;
  readonly panelDeep: string;
  readonly onPanel: string;
  readonly onPanelMuted: string;
  readonly panelLine: string;
}

/**
 * Light: a clean neutral daylight (white cards on a cool off-white), no tint.
 * The hero surface (`panel`) is bright here too: white lit by the logo's glow.
 */
export const LIGHT_COLORS: ThemeColors = {
  canvas: '#F5F6F8',
  surface: '#FAFBFC',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#ECEEF1',
  borderSubtle: '#E3E6EA',
  borderStrong: '#CDD2D8',
  textPrimary: '#14171A',
  textSecondary: '#4D5560',
  textTertiary: '#5D6570',
  accent: '#006EAA',
  accentHover: '#005F93',
  accentPressed: '#00507C',
  onAccent: '#FFFFFF',
  accentSoft: '#E1EEF7',
  onAccentSoft: '#00598A',
  energy: '#3F9A45',
  energySoft: '#E3F1DE',
  focusRing: '#006EAA',
  scrim: 'rgba(20, 23, 26, 0.45)',
  panel: '#FFFFFF',
  panelDeep: '#EFF6F8',
  onPanel: '#14171A',
  onPanelMuted: '#4D5560',
  panelLine: 'rgba(0, 110, 170, 0.09)',
};

/** Dark: a neutral charcoal (no blue cast); the hero surface is the deep ocean. */
export const DARK_COLORS: ThemeColors = {
  canvas: '#0F1113',
  surface: '#141619',
  surfaceRaised: '#1A1D21',
  surfaceSunken: '#0A0B0D',
  borderSubtle: '#262A30',
  borderStrong: '#373C44',
  textPrimary: '#ECEEF0',
  textSecondary: '#AEB4BC',
  textTertiary: '#8E959E',
  accent: '#5BB8EC',
  accentHover: '#7CC7F0',
  accentPressed: '#9AD4F3',
  onAccent: '#04202F',
  accentSoft: '#10283A',
  onAccentSoft: '#A6D8F4',
  energy: '#7DCB6A',
  energySoft: '#15281A',
  focusRing: '#5BB8EC',
  scrim: 'rgba(0, 0, 0, 0.62)',
  panel: '#062B3F',
  panelDeep: '#03161F',
  onPanel: '#EEF5F4',
  onPanelMuted: '#A9C5CA',
  panelLine: 'rgba(169, 197, 202, 0.10)',
};

/**
 * The deep ocean, whatever the theme: for brand moments that should always be
 * dark (the desktop sign-in panel, the night sky). Applied with `.oh-ocean`.
 */
export const OCEAN_PANEL = {
  panel: '#05344D',
  panelDeep: '#041F2E',
  onPanel: '#F2F7F6',
  onPanelMuted: '#B9D2D6',
  panelLine: 'rgba(185, 210, 214, 0.14)',
} as const satisfies Partial<ThemeColors>;

/**
 * Who a delay is waiting on. Category colours for charts and chips, never status.
 * EPC work waits on four parties, and only internal time counts against the team.
 */
export const PARTY_SWATCHES = {
  light: { internal: '#006EAA', customer: '#C8901E', bank: '#7255C2', discom: '#4D6177' },
  dark: { internal: '#5BB8EC', customer: '#D9B26A', bank: '#9D87E9', discom: '#9FB3C8' },
} as const;

export type Party = keyof (typeof PARTY_SWATCHES)['light'];

/** Project identity colours (timeline bars, chips). Never used for status. */
export const PROJECT_SWATCHES = {
  light: ['#006EAA', '#21998C', '#3F9A45', '#A9583A', '#946A1E', '#7A4875'],
  dark: ['#5BB8EC', '#4FC2B4', '#7DCB6A', '#E09A78', '#D9B26A', '#D49ACB'],
} as const;
