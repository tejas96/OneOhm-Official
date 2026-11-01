'use client';

import { Button, Field, IconButton, Input } from '@oneohm/design-system/web';
import { addDays } from '@oneohm/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWorkforceFormat } from '../workforce-format';

/** The day being looked at: step a day at a time, jump to a date, or come back to today. */
export function DayPicker({
  date,
  today,
  onChange,
}: {
  readonly date: string;
  readonly today: string;
  readonly onChange: (date: string) => void;
}) {
  const t = useTranslations('team.attendance');
  const format = useWorkforceFormat();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="flex gap-1">
          <IconButton
            variant="secondary"
            size="sm"
            label={t('previousDay')}
            onClick={() => onChange(addDays(date, -1))}
          >
            <ChevronLeft aria-hidden />
          </IconButton>
          <IconButton
            variant="secondary"
            size="sm"
            label={t('nextDay')}
            disabled={date >= today}
            onClick={() => onChange(addDays(date, 1))}
          >
            <ChevronRight aria-hidden />
          </IconButton>
        </span>
        <h2 className="px-1 type-title-lg text-ink [font-family:var(--font-display)]">
          {format.longDay(date)}
        </h2>
        {date !== today && (
          <Button variant="quiet" size="sm" onClick={() => onChange(today)}>
            {t('today')}
          </Button>
        )}
      </div>
      <Field label={t('day')} hideLabel className="sm:w-48">
        <Input
          type="date"
          value={date}
          max={today}
          onChange={(event) => event.target.value && onChange(event.target.value)}
        />
      </Field>
    </div>
  );
}
