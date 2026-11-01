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

export const LIGHT_COLORS: ThemeColors = {
  canvas: '#F3F1EB',
  surface: '#FAF9F5',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#E8E5DC',
  borderSubtle: '#E2DED4',
  borderStrong: '#C9C3B6',
  textPrimary: '#13201F',
  textSecondary: '#4A5654',
  textTertiary: '#5E6866',
  accent: '#006EAA',
  accentHover: '#005F93',
  accentPressed: '#00507C',
  onAccent: '#FFFFFF',
  accentSoft: '#E0EEF7',
  onAccentSoft: '#00598A',
  energy: '#3F9A45',
  energySoft: '#E3F1DE',
  focusRing: '#006EAA',
  scrim: 'rgba(12, 20, 22, 0.48)',
  panel: '#05344D',
  panelDeep: '#041F2E',
  onPanel: '#F2F7F6',
  onPanelMuted: '#B9D2D6',
  panelLine: 'rgba(185, 210, 214, 0.14)',
};

export const DARK_COLORS: ThemeColors = {
  canvas: '#0C1315',
  surface: '#11191C',
  surfaceRaised: '#172125',
  surfaceSunken: '#080D0F',
  borderSubtle: '#223034',
  borderStrong: '#34464B',
  textPrimary: '#E6EDEB',
  textSecondary: '#A8B5B3',
  textTertiary: '#8A9896',
  accent: '#5BB8EC',
  accentHover: '#7CC7F0',
  accentPressed: '#9AD4F3',
  onAccent: '#04202F',
  accentSoft: '#0F2A3A',
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
