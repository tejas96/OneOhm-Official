'use client';

import { cn, Tooltip } from '@oneohm/design-system/web';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useThemePreference } from '@/providers/app-providers';
import { THEME_PREFERENCES } from '@/providers/preferences';

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

interface ThemeSwitchProps {
  readonly className?: string;
  /** One button that steps to the next choice, for the collapsed sidebar. */
  readonly compact?: boolean;
}

/** Light, dark or follow the device — saved for the next visit. */
export function ThemeSwitch({ className, compact = false }: ThemeSwitchProps) {
  const t = useTranslations('appearance');
  const { theme, setTheme } = useThemePreference();
  // The sidebar and the phone menu each hold a switch; their radio groups must not merge.
  const name = useId();
  if (compact) {
    const Icon = ICONS[theme];
    const next =
      THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(theme) + 1) % THEME_PREFERENCES.length];
    return (
      <Tooltip content={`${t('label')}: ${t(theme)}`} side="right">
        <button
          type="button"
          aria-label={`${t('label')}: ${t(theme)}`}
          onClick={() => next && setTheme(next)}
          className={cn(
            'flex h-9 items-center justify-center rounded-lg border border-hairline bg-sunken/60 text-ink-muted',
            'transition-colors duration-(--duration-fast) hover:text-ink',
            className,
          )}
        >
          <Icon aria-hidden className="size-4" />
        </button>
      </Tooltip>
    );
  }
  return (
    <fieldset
      className={cn('flex rounded-lg border p-0.5', 'border-hairline bg-sunken/60', className)}
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
              'text-ink-faint hover:text-ink',
              selected && 'bg-raised text-ink shadow-e1',
            )}
          >
            <input
              type="radio"
              name={name}
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
