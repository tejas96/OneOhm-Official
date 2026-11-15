'use client';

import type { MarketingConnections, MarketingSettingsRecord } from '@oneohm/api-contracts';
import { Button, Card, Field, Input } from '@oneohm/design-system/web';
import { checkMarketingSettings } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import { paiseFromRupeeText } from './marketing-words';
import { useSaveSettings } from './use-save-settings';

interface Fields {
  readonly budget: string;
  readonly city: string;
  readonly radius: string;
  readonly website: string;
  readonly privacy: string;
  readonly days: string;
  readonly low: string;
}

const rupees = (paise: number) => String(Math.round(paise / 100));

function fieldsOf(settings: MarketingSettingsRecord): Fields {
  return {
    budget: rupees(settings.defaultDailyBudgetPaise),
    city: settings.defaultCity,
    radius: String(settings.radiusKm),
    website: settings.websiteUrl,
    privacy: settings.privacyPolicyUrl,
    days: String(settings.noLeadAlertDays),
    low: rupees(settings.lowBalancePaise),
  };
}

function recordOf(fields: Fields, base: MarketingSettingsRecord): MarketingSettingsRecord {
  return {
    ...base,
    defaultDailyBudgetPaise: paiseFromRupeeText(fields.budget),
    defaultCity: fields.city.trim(),
    radiusKm: Math.round(Number(fields.radius)),
    websiteUrl: fields.website.trim(),
    privacyPolicyUrl: fields.privacy.trim(),
    noLeadAlertDays: Math.round(Number(fields.days)),
    lowBalancePaise: fields.low === '' ? 0 : paiseFromRupeeText(fields.low),
  };
}

/** The few defaults a business sets once: first budget, city, links and when to be told. */
export function DefaultsForm({ data }: { readonly data: MarketingConnections }) {
  const t = useTranslations('marketing');
  const { form, save } = useSaveSettings();
  const [fields, setFields] = useState(() => fieldsOf(data.settings));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const set = (change: Partial<Fields>) => setFields((current) => ({ ...current, ...change }));
  const errorOf = (name: string) => problems[name] ?? form.fieldErrors[name] ?? null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const record = recordOf(fields, data.settings);
    const found = checkMarketingSettings(record);
    setProblems(found);
    if (Object.keys(found).length === 0) void save(record);
  };

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-0.5">
          <h2 className="type-title-md text-ink">{t('defaults.title')}</h2>
          <p className="type-body-sm text-ink-muted">{t('defaults.intro')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('defaults.budget')} error={errorOf('defaultDailyBudgetPaise')}>
            <Input
              inputMode="numeric"
              leading="₹"
              value={fields.budget}
              onChange={(e) => set({ budget: e.target.value.replace(/[^\d]/g, '') })}
            />
          </Field>
          <Field label={t('defaults.city')} error={errorOf('defaultCity')}>
            <Input value={fields.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label={t('defaults.radius')} error={errorOf('radiusKm')}>
            <Input
              inputMode="numeric"
              value={fields.radius}
              onChange={(e) => set({ radius: e.target.value.replace(/[^\d]/g, '') })}
            />
          </Field>
          <Field
            label={t('defaults.days')}
            hint={t('defaults.daysHint')}
            error={errorOf('noLeadAlertDays')}
          >
            <Input
              inputMode="numeric"
              value={fields.days}
              onChange={(e) => set({ days: e.target.value.replace(/[^\d]/g, '') })}
            />
          </Field>
          <Field
            label={t('defaults.low')}
            hint={t('defaults.lowHint')}
            error={errorOf('lowBalancePaise')}
          >
            <Input
              inputMode="numeric"
              leading="₹"
              value={fields.low}
              onChange={(e) => set({ low: e.target.value.replace(/[^\d]/g, '') })}
            />
          </Field>
          <Field label={t('defaults.website')} error={errorOf('websiteUrl')}>
            <Input
              type="url"
              placeholder="https://"
              value={fields.website}
              onChange={(e) => set({ website: e.target.value })}
            />
          </Field>
          <Field
            label={t('defaults.privacy')}
            hint={t('defaults.privacyHint')}
            error={errorOf('privacyPolicyUrl')}
            className="sm:col-span-2"
          >
            <Input
              type="url"
              placeholder="https://"
              value={fields.privacy}
              onChange={(e) => set({ privacy: e.target.value })}
            />
          </Field>
        </div>
        <FormError message={form.error} />
        <Button type="submit" variant="primary" className="self-start" pending={form.pending}>
          {t('defaults.save')}
        </Button>
      </form>
    </Card>
  );
}
