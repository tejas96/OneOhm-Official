'use client';

import type { OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { Field, Input, Switch } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { NumberInput } from '../number-input';
import { SaveBar } from '../rules/save-bar';
import { RULE_KEYS, useRuleSettings } from '../rules/use-rule-settings';
import { SettingsSection } from '../settings-section';
import { BillBandsTable } from './bill-bands-table';
import { FormsSection } from './forms-section';
import { PanelPickers } from './panel-pickers';

/**
 * Settings → Selling → WhatsApp onboarding: whether the bot greets strangers, the cities
 * and bill choices it offers, the numbers behind the instant estimate, and an optional
 * panel per site type. Amounts show in rupees and sizes in kW; the API keeps paise and Wp.
 */
export function OnboardingPanel() {
  const t = useTranslations('settings.onboarding');
  const rule = useRuleSettings<OnboardingSettingsRecord>(
    RULE_KEYS.onboarding,
    () => expectStatus(api.businessSettings.onboarding(), 200),
    (body) => expectStatus(api.businessSettings.saveOnboarding({ body }), 200),
    t('title'),
  );
  const { draft, patch, form } = rule;
  if (rule.query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (!draft) return null;
  const errors = form.fieldErrors;
  const narrow = 'sm:max-w-48';

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <form onSubmit={rule.submit} noValidate className="flex flex-col gap-8">
        <SettingsSection title={t('title')} description={t('help')}>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => patch({ enabled })}
            label={t('enabled')}
            description={t('enabledHint')}
          />
          <Field label={t('cities')} hint={t('citiesHint')} error={errors.serviceCities}>
            <Input
              value={draft.serviceCities.join(',')}
              onChange={(event) => patch({ serviceCities: event.target.value.split(',') })}
              placeholder={t('citiesPlaceholder')}
            />
          </Field>
        </SettingsSection>
        <SettingsSection title={t('bands')} description={t('bandsHint')}>
          <BillBandsTable
            bands={draft.billBands}
            errors={errors}
            onChange={(billBands) => patch({ billBands })}
          />
          {errors.billBands && <p className="type-body-sm text-overdue">{errors.billBands}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('tariff')} error={errors.tariffPaisePerUnit}>
              <div className={narrow}>
                <NumberInput
                  unit="paise"
                  value={draft.tariffPaisePerUnit}
                  onValueChange={(value) => patch({ tariffPaisePerUnit: value ?? 0 })}
                />
              </div>
            </Field>
            <Field label={t('unitsPerKw')} error={errors.unitsPerKwMonth}>
              <div className={narrow}>
                <NumberInput
                  unit="decimal"
                  value={draft.unitsPerKwMonth}
                  onValueChange={(value) => patch({ unitsPerKwMonth: value ?? 0 })}
                />
              </div>
            </Field>
          </div>
          <Field label={t('nudge')} hint={t('nudgeHint')} error={errors.nudgeAfterHours}>
            <div className={narrow}>
              <NumberInput
                unit="whole"
                value={draft.nudgeAfterHours}
                onValueChange={(value) => patch({ nudgeAfterHours: value ?? 0 })}
              />
            </div>
          </Field>
        </SettingsSection>
        <SettingsSection title={t('panels')} description={t('panelsHint')}>
          <PanelPickers
            value={draft.panelProductIds}
            errors={errors}
            onChange={(panelProductIds) => patch({ panelProductIds })}
          />
        </SettingsSection>
        <SaveBar
          dirty={rule.dirty}
          pending={form.pending}
          error={form.error}
          onDiscard={rule.discard}
        />
      </form>
      <FormsSection />
    </div>
  );
}
