'use client';

import { cn } from '@oneohm/design-system/web';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useThemePreference } from '@/providers/app-providers';
import { THEME_PREFERENCES } from '@/providers/preferences';

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Light, dark or follow the device — saved for the next visit. */
export function ThemeSwitch({
  className,
  onPanel = false,
}: {
  readonly className?: string;
  /** On the ocean sidebar: glassy track, white selection. */
  readonly onPanel?: boolean;
}) {
  const t = useTranslations('appearance');
  const { theme, setTheme } = useThemePreference();
  return (
    <fieldset
      className={cn(
        'flex rounded-lg border p-0.5',
        onPanel ? 'border-on-panel/15 bg-on-panel/[0.06]' : 'border-hairline bg-sunken/60',
        className,
      )}
    >
      <legend className="sr-only">{t('label')}</legend>
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option];
        const selected = theme === option;
        return (
          <label
            key={option}
            title={t(option)}
            className={cn(
              'relative flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md',
              'transition-colors duration-(--duration-fast)',
              'has-focus-visible:outline-2 has-focus-visible:outline-focus',
              onPanel ? 'text-on-panel-muted hover:text-on-panel' : 'text-ink-faint hover:text-ink',
              selected &&
                (onPanel ? 'bg-on-panel/15 text-on-panel' : 'bg-raised text-ink shadow-e1'),
            )}
          >
            <input
              type="radio"
              name="theme"
              value={option}
              checked={selected}
              onChange={() => setTheme(option)}
              className="sr-only"
            />
            <Icon aria-hidden className="size-4" />
            <span className="sr-only">{t(option)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
