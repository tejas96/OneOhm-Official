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
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { createTokenStore } from '../api/token-store';

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

/** What the person picked: follow the phone, or always light, or always dark. */
export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

interface PreferenceState {
  readonly preference: ThemePreference;
  readonly setPreference: (next: ThemePreference) => void;
}

const PreferenceContext = createContext<PreferenceState>({
  preference: 'system',
  setPreference: () => {},
});

const isPreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

/**
 * Light and dark follow the phone's setting unless the person picks one in the app
 * (saved under `storageKey`), or `scheme` forces one.
 */
export function ThemeProvider({
  children,
  scheme,
  storageKey,
}: {
  readonly children: ReactNode;
  readonly scheme?: 'light' | 'dark';
  readonly storageKey?: string;
}) {
  const system = useColorScheme();
  const store = useMemo(() => (storageKey ? createTokenStore(storageKey) : null), [storageKey]);
  const [preference, setLocal] = useState<ThemePreference>('system');
  useEffect(() => {
    void store?.read().then((saved) => {
      if (isPreference(saved)) setLocal(saved);
    });
  }, [store]);
  const setPreference = useCallback(
    (next: ThemePreference) => {
      setLocal(next);
      void store?.write(next).catch(() => {});
    },
    [store],
  );
  const picked = preference === 'system' ? system : preference;
  const resolved = scheme ?? (picked === 'dark' ? 'dark' : 'light');
  const state = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return (
    <PreferenceContext value={state}>
      <ThemeContext value={resolved === 'dark' ? DARK_THEME : LIGHT_THEME}>{children}</ThemeContext>
    </PreferenceContext>
  );
}

export function useTheme(): MobileTheme {
  return use(ThemeContext);
}

/** The saved light / dark / phone choice, and how to change it. */
export function useThemePreference(): PreferenceState {
  return use(PreferenceContext);
}
