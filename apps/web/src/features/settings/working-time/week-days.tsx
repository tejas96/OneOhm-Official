'use client';

import { cn } from '@oneohm/design-system/web';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Monday first, as the week is read in India; 0 is Sunday.
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/** Seven weekday toggles; a lit day is a working day. */
export function WeekDays({
  weeklyOff,
  onToggle,
  error,
}: {
  readonly weeklyOff: readonly number[];
  readonly onToggle: (weekday: number) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('settings.workingTime');
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 type-label text-ink-muted">{t('workingDays')}</legend>
      <div className="flex flex-wrap gap-2">
        {WEEK.map((day) => {
          const on = !weeklyOff.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(day)}
              className={cn(
                'flex h-11 min-w-14 flex-col items-center justify-center rounded-md border px-2 type-body-sm transition-colors',
                on
                  ? 'border-accent/40 bg-accent-soft text-on-accent-soft'
                  : 'border-hairline bg-raised text-ink-faint hover:text-ink',
              )}
            >
              <span className="font-medium">{t(`days.${day}`)}</span>
              {on && <Check aria-hidden className="size-3" />}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="type-body-sm text-overdue">
          {error}
        </p>
      )}
    </fieldset>
  );
}
