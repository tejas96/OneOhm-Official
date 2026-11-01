'use client';

import { MotionPreferenceProvider } from '@oneohm/design-system/web';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { MOTION_COOKIE, preferenceCookie, THEME_COOKIE, type ThemePreference } from './preferences';

interface ThemeContextValue {
  readonly theme: ThemePreference;
  readonly setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => undefined,
});

export function useThemePreference(): ThemeContextValue {
  return useContext(ThemeContext);
}

interface AppProvidersProps {
  readonly initialTheme: ThemePreference;
  readonly initialCalmMotion: boolean;
  readonly children: ReactNode;
}

/** Appearance preferences: applied to <html> at once and saved for the next visit. */
export function AppProviders({ initialTheme, initialCalmMotion, children }: AppProvidersProps) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [calm, setCalmState] = useState(initialCalmMotion);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie, read by the server for first paint.
    document.cookie = preferenceCookie(THEME_COOKIE, next);
  }, []);

  const setCalm = useCallback((next: boolean) => {
    setCalmState(next);
    const root = document.documentElement;
    if (next) root.dataset.motion = 'calm';
    else delete root.dataset.motion;
    // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie, read by the server for first paint.
    document.cookie = preferenceCookie(MOTION_COOKIE, next ? 'calm' : 'full');
  }, []);

  const themeValue = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return (
    <ThemeContext.Provider value={themeValue}>
      <MotionPreferenceProvider calm={calm} onCalmChange={setCalm}>
        {children}
      </MotionPreferenceProvider>
    </ThemeContext.Provider>
  );
}
