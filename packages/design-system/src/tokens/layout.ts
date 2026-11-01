/** Radius in px. Nested radius rule: inner = outer − inset. */
export const RADIUS = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, full: 999 } as const;

/** 4px base spacing scale. */
export const SPACING = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96] as const;

/** Light-theme shadows: soft, neutral ink (20,23,26); the largest one is tinted ocean. */
export const ELEVATION = {
  e0: 'none',
  e1: '0 1px 2px rgba(20,23,26,.06), 0 1px 1px rgba(20,23,26,.04)',
  e2: '0 2px 4px rgba(20,23,26,.05), 0 12px 24px -12px rgba(20,23,26,.18)',
  e3: '0 4px 8px rgba(20,23,26,.06), 0 24px 48px -16px rgba(20,23,26,.26)',
  e4: '0 32px 80px -24px rgba(5,52,77,.42)',
} as const;

/** Dark-theme shadows: deeper and black, because dark surfaces lift by tone, not by shade. */
export const DARK_ELEVATION: Readonly<Record<keyof typeof ELEVATION, string>> = {
  e0: 'none',
  e1: '0 1px 2px rgba(0,0,0,.40)',
  e2: '0 2px 4px rgba(0,0,0,.30), 0 12px 24px -12px rgba(0,0,0,.50)',
  e3: '0 4px 8px rgba(0,0,0,.30), 0 24px 48px -16px rgba(0,0,0,.60)',
  e4: '0 32px 80px -24px rgba(0,0,0,.72)',
};

export const MIN_TOUCH_TARGET = 44;

/** Responsive breakpoints in px (sidebar ↔ top bar switches at `md`). */
export const BREAKPOINTS = { sm: 640, md: 900, lg: 1200, xl: 1440 } as const;
