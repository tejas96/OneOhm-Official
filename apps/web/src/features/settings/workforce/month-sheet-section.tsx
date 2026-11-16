'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Field, Switch } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';

type Attendance = WorkforcePolicyInput['attendance'];

/**
 * The rules the month sheet applies to every person: what a half day is, whether days off need
 * work in their week, and what lates cost.
 */
export function MonthSheetSection({
  attendance,
  onChange,
  errors,
}: {
  readonly attendance: Attendance;
  readonly onChange: (attendance: Attendance) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workforce.monthSheet');
  const every = attendance.lateDeduction?.every ?? 0;
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="sm:max-w-40">
        <Field
          label={t('halfDay')}
          hint={t('halfDayHint')}
          error={errors['attendance.halfDayHours']}
        >
          <NumberInput
            unit="decimal"
            step={0.5}
            value={attendance.halfDayHours ?? 4}
            onValueChange={(value) => onChange({ ...attendance, halfDayHours: value ?? 4 })}
          />
        </Field>
      </div>
      <Switch
        checked={attendance.offsNeedWorkInWeek ?? true}
        onCheckedChange={(offsNeedWorkInWeek) => onChange({ ...attendance, offsNeedWorkInWeek })}
        label={t('offs')}
        description={(attendance.offsNeedWorkInWeek ?? true) ? t('offsOn') : t('offsOff')}
      />
      <div className="flex flex-col gap-2">
        <div className="sm:max-w-40">
          <Field
            label={t('late')}
            hint={t('lateHint')}
            error={errors['attendance.lateDeduction.every']}
          >
            <NumberInput
              unit="whole"
              value={every}
              onValueChange={(value) =>
                onChange({ ...attendance, lateDeduction: { every: value ?? 0 } })
              }
            />
          </Field>
        </div>
        <p className="type-body-sm text-ink-muted">
          {every > 0 ? t('lateOn', { count: every }) : t('lateOff')}
        </p>
      </div>
    </SettingsSection>
  );
}
