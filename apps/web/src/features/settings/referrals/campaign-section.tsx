'use client';

import type { ReferralProgram, ReferralProgramInput } from '@oneohm/api-contracts';
import { Field, Input, ShareBar } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';

type Patch = (patch: Partial<ReferralProgramInput>) => void;

/** From when referrals count, the campaign budget and what one customer can earn. */
export function CampaignSection({
  draft,
  saved,
  onChange,
  errors,
}: {
  readonly draft: ReferralProgramInput;
  readonly saved: ReferralProgram;
  readonly onChange: Patch;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.referrals.campaign');
  const budget = saved.budgetPaise;
  const committed = saved.committedPaise;
  const unpaid = Math.max(0, committed - saved.paidPaise);
  const left = budget === null ? null : Math.max(0, budget - committed);
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t('startsOn')} hint={t('startsOnHint')} required error={errors.startsOn}>
          <Input
            type="date"
            value={draft.startsOn}
            onChange={(event) => onChange({ startsOn: event.target.value })}
          />
        </Field>
        <Field label={t('budget')} hint={t('budgetHint')} error={errors.budgetPaise}>
          <NumberInput
            unit="paise"
            value={draft.budgetPaise}
            onValueChange={(budgetPaise) => onChange({ budgetPaise })}
          />
        </Field>
        <Field label={t('perCustomerCount')} hint={t('noLimit')} error={errors.perCustomerCount}>
          <NumberInput
            unit="whole"
            value={draft.perCustomerCount}
            onValueChange={(value) =>
              onChange({ perCustomerCount: value && value > 0 ? value : null })
            }
          />
        </Field>
        <Field label={t('perCustomerPaise')} hint={t('noLimit')} error={errors.perCustomerPaise}>
          <NumberInput
            unit="paise"
            value={draft.perCustomerPaise}
            onValueChange={(perCustomerPaise) => onChange({ perCustomerPaise })}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-3 rounded-lg bg-sunken/60 px-4 py-3.5">
        <p className="type-body-sm text-ink">
          {budget === null
            ? t('usageNoBudget', {
                committed: formatInr(committed),
                paid: formatInr(saved.paidPaise),
              })
            : t('usage', {
                committed: formatInr(committed),
                budget: formatInr(budget),
                left: formatInr(left ?? 0),
              })}
        </p>
        {budget !== null && budget > 0 && (
          <ShareBar
            label={t('usageLabel')}
            format={formatInr}
            segments={[
              {
                key: 'paid',
                label: t('paid'),
                value: saved.paidPaise,
                colorClassName: 'bg-done-solid',
              },
              { key: 'owed', label: t('owed'), value: unpaid, colorClassName: 'bg-accent' },
              { key: 'left', label: t('left'), value: left ?? 0, colorClassName: 'bg-hairline' },
            ]}
          />
        )}
      </div>
    </SettingsSection>
  );
}
