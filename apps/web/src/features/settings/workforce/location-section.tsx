'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Field, Switch } from '@oneohm/design-system/web';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { TrackingByRole } from './tracking-by-role';

type Attendance = WorkforcePolicyInput['attendance'];

/** Whether check-in asks for the phone's location, what that means, and how long it is kept. */
export function LocationSection({
  attendance,
  onChange,
  errors,
}: {
  readonly attendance: Attendance;
  readonly onChange: (attendance: Attendance) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workforce.location');
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <Switch
        checked={attendance.captureLocation}
        onCheckedChange={(captureLocation) => onChange({ ...attendance, captureLocation })}
        label={t('capture')}
        description={attendance.captureLocation ? t('captureOn') : t('captureOff')}
      />
      <TrackingByRole
        byRole={attendance.trackingByRole}
        company={attendance.captureLocation}
        onChange={(trackingByRole) => onChange({ ...attendance, trackingByRole })}
      />
      <Switch
        checked={attendance.autoCheckInFromSite}
        onCheckedChange={(autoCheckInFromSite) => onChange({ ...attendance, autoCheckInFromSite })}
        label={t('autoCheckIn')}
        description={attendance.autoCheckInFromSite ? t('autoCheckInOn') : t('autoCheckInOff')}
      />
      <div className="flex items-start gap-3 rounded-lg bg-sunken/70 px-4 py-3.5">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <div className="flex flex-col gap-1.5 type-body-sm text-ink-muted">
          <p className="font-medium text-ink">{t('privacyTitle')}</p>
          <p>{t('privacyConsent')}</p>
          <p>{t('privacyMoments')}</p>
          <p>{t('privacyRetention', { days: attendance.retentionDays })}</p>
        </div>
      </div>
      <Field
        label={t('retention')}
        hint={t('retentionHint')}
        error={errors['attendance.retentionDays']}
        className="max-w-xs"
      >
        <NumberInput
          unit="whole"
          value={attendance.retentionDays}
          onValueChange={(value) => onChange({ ...attendance, retentionDays: value ?? 0 })}
        />
      </Field>
    </SettingsSection>
  );
}
