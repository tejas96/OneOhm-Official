import {
  BRAND,
  DARK_COLORS,
  DARK_STATUS,
  LIGHT_COLORS,
  LIGHT_STATUS,
  OCEAN_PANEL,
  PARTY_SWATCHES,
  type Party,
  type StatusColor,
  type StatusTone,
  type ThemeColors,
} from '@oneohm/design-system/tokens';
import { createContext, type ReactNode, use } from 'react';
import { useColorScheme } from 'react-native';

export type Tone = StatusTone | 'neutral';

export interface MobileTheme {
  readonly scheme: 'light' | 'dark';
  readonly colors: ThemeColors;
  readonly status: Readonly<Record<Tone, StatusColor>>;
  readonly party: Readonly<Record<Party, string>>;
  /** The deep ocean, whatever the theme (brand moments, the night sky). */
  readonly ocean: typeof OCEAN_PANEL;
  readonly brand: typeof BRAND;
  /** A soft brand glow behind the top of a screen. */
  readonly glow: readonly [string, string];
}

function build(scheme: 'light' | 'dark'): MobileTheme {
  const colors = scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const status = scheme === 'dark' ? DARK_STATUS : LIGHT_STATUS;
  return {
    scheme,
    colors,
    status: {
      ...status,
      neutral: { fg: colors.textSecondary, tint: colors.surfaceSunken, solid: colors.borderStrong },
    },
    party: PARTY_SWATCHES[scheme],
    ocean: OCEAN_PANEL,
    brand: BRAND,
    glow: scheme === 'dark' ? ['#0B3A52', colors.canvas] : ['#E3F0F4', colors.canvas],
  };
}

const LIGHT_THEME = build('light');
const DARK_THEME = build('dark');

const ThemeContext = createContext<MobileTheme>(LIGHT_THEME);

/** Light and dark follow the phone's setting unless `scheme` forces one. */
export function ThemeProvider({
  children,
  scheme,
}: {
  readonly children: ReactNode;
  readonly scheme?: 'light' | 'dark';
}) {
  const system = useColorScheme();
  const resolved = scheme ?? (system === 'dark' ? 'dark' : 'light');
  return (
    <ThemeContext value={resolved === 'dark' ? DARK_THEME : LIGHT_THEME}>{children}</ThemeContext>
  );
}

export function useTheme(): MobileTheme {
  return use(ThemeContext);
}
