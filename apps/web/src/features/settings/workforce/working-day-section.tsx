'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Field } from '@oneohm/design-system/web';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { useWorkingTime } from '../working-time/use-working-time';
import { openingParts } from '../working-time/working-time-text';

type Attendance = WorkforcePolicyInput['attendance'];

/**
 * The working week is read-only here: days, hours and lunch are set once in Working time &
 * holidays. What stays is how late a check-in may be before it counts as late.
 */
export function WorkingDaySection({
  attendance,
  onChange,
  errors,
}: {
  readonly attendance: Attendance;
  readonly onChange: (attendance: Attendance) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workforce.workingDay');
  const pathname = usePathname();
  const work = useWorkingTime();
  const parts = work.data ? openingParts(work.data) : null;
  const summary = parts
    ? `${parts.open}${parts.lunch ? `, ${t('lunch', { time: parts.lunch })}` : ''}`
    : '…';

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <p className="type-body text-ink">
        {t('summary', { summary })}{' '}
        <Link
          href={`${pathname}?tab=workingTime`}
          className="text-accent underline-offset-2 hover:underline"
        >
          {t('setIn')}
        </Link>
      </p>
      <div className="sm:max-w-40">
        <Field label={t('grace')} hint={t('graceHint')} error={errors['attendance.graceMinutes']}>
          <NumberInput
            unit="whole"
            value={attendance.graceMinutes}
            onValueChange={(value) => onChange({ ...attendance, graceMinutes: value ?? 0 })}
          />
        </Field>
      </div>
    </SettingsSection>
  );
}
