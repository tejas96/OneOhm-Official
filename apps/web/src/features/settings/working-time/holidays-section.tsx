'use client';

import type { Holiday } from '@oneohm/api-contracts';
import { Button, cn, Field, IconButton, Input } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { withHoliday, withoutHoliday } from './working-time-draft';

/** Company holidays: add a date and a name, remove one; past days are greyed. */
export function HolidaysSection({
  holidays,
  onChange,
  errors,
}: {
  readonly holidays: readonly Holiday[];
  readonly onChange: (holidays: Holiday[]) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workingTime.holidays');
  const format = useFormatter();
  const today = todayIn();
  const [day, setDay] = useState('');
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = () => {
    if (holidays.some((holiday) => holiday.day === day)) {
      setProblem(t('duplicate'));
      return;
    }
    const next = withHoliday(holidays, day, name);
    if (!next) {
      setProblem(t('missing'));
      return;
    }
    onChange(next);
    setDay('');
    setName('');
    setProblem(null);
  };
  const dayText = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <Field label={t('date')}>
          <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field label={t('name')} error={problem ?? undefined}>
          <Input
            value={name}
            maxLength={80}
            placeholder={t('namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button variant="secondary" onClick={add}>
          {t('add')}
        </Button>
      </div>
      {holidays.length === 0 ? (
        <p className="type-body-sm text-ink-faint">{t('none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
          {holidays.map((holiday, index) => {
            const past = holiday.day < today;
            const error = errors[`holidays.${index}.name`] ?? errors[`holidays.${index}.day`];
            return (
              <li
                key={holiday.day}
                className={cn('flex items-center gap-3 px-4 py-2.5', past && 'text-ink-faint')}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-body">{holiday.name}</span>
                  <span className="type-body-sm text-ink-faint">
                    {dayText(holiday.day)}
                    {past && ` · ${t('past')}`}
                  </span>
                  {error && <span className="type-body-sm text-overdue">{error}</span>}
                </div>
                <IconButton
                  label={t('remove', { name: holiday.name })}
                  onClick={() => onChange(withoutHoliday(holidays, holiday.day))}
                >
                  <X />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
