'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { cn, Field, Input } from '@oneohm/design-system/web';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';

type Attendance = WorkforcePolicyInput['attendance'];
// Monday first, as the week is read in India; 0 is Sunday.
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/** Which days are worked, when the day starts and ends, and how late counts as late. */
export function WorkingDaySection({
  weeklyOff,
  attendance,
  onChange,
  errors,
}: {
  readonly weeklyOff: readonly number[];
  readonly attendance: Attendance;
  readonly onChange: (patch: { weeklyOff?: number[]; attendance?: Attendance }) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workforce.workingDay');
  const working = WEEK.filter((day) => !weeklyOff.includes(day));
  const toggle = (day: number) => {
    const off = weeklyOff.includes(day);
    // Keep at least one working day.
    if (!off && working.length === 1) return;
    onChange({
      weeklyOff: off
        ? weeklyOff.filter((other) => other !== day)
        : [...weeklyOff, day].sort((a, b) => a - b),
    });
  };
  const offNames = WEEK.filter((day) => weeklyOff.includes(day)).map((day) => t(`days.${day}`));

  return (
    <SettingsSection title={t('title')} description={t('description')}>
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
                onClick={() => toggle(day)}
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
        <p className="type-body-sm text-ink-faint">
          {offNames.length > 0 ? t('offDays', { days: offNames.join(', ') }) : t('noOffDays')}
        </p>
        {errors.weeklyOff && <p className="type-body-sm text-overdue">{errors.weeklyOff}</p>}
      </fieldset>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label={t('dayStart')} error={errors['attendance.dayStart']}>
          <Input
            type="time"
            value={attendance.dayStart}
            onChange={(event) =>
              onChange({ attendance: { ...attendance, dayStart: event.target.value } })
            }
          />
        </Field>
        <Field label={t('dayEnd')} error={errors['attendance.dayEnd'] ?? errors.dayEnd}>
          <Input
            type="time"
            value={attendance.dayEnd}
            onChange={(event) =>
              onChange({ attendance: { ...attendance, dayEnd: event.target.value } })
            }
          />
        </Field>
        <Field label={t('grace')} hint={t('graceHint')} error={errors['attendance.graceMinutes']}>
          <NumberInput
            unit="whole"
            value={attendance.graceMinutes}
            onValueChange={(value) =>
              onChange({ attendance: { ...attendance, graceMinutes: value ?? 0 } })
            }
          />
        </Field>
      </div>
    </SettingsSection>
  );
}
