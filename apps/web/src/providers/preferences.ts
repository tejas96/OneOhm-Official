/** Appearance preferences live in cookies so the server paints the right theme first time. */
export const THEME_COOKIE = 'oneohm-theme';
export const MOTION_COOKIE = 'oneohm-motion';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function parseThemePreference(value: string | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function parseCalmMotion(value: string | undefined): boolean {
  return value === 'calm';
}

/** One year; preferences are not secrets, so the cookie stays readable by the page. */
export function preferenceCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
