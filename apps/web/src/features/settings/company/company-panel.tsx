'use client';

import type { Company } from '@oneohm/api-contracts';
import { Button, Field, Input, Textarea, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { CompanyAssetsSection } from '@/features/documents/company-assets-section';
import { ReportVisibilitySection } from '@/features/documents/report-visibility-section';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { SETTINGS_KEYS, useCompany } from '../use-settings';

/** The base location is set with the travel rates (Settings → Rates), not here. */
type TextKey = Exclude<
  keyof Company,
  'phones' | 'quotationValidityDays' | 'baseLatitude' | 'baseLongitude'
>;

/** The company details printed on every quotation, invoice and report. */
export function CompanyPanel() {
  const t = useTranslations('settings.company');
  const settingsT = useTranslations('settings');
  const company = useCompany();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState<Company | null>(null);
  const [phones, setPhones] = useState('');

  useEffect(() => {
    if (!company.data) return;
    setDraft(company.data);
    setPhones(company.data.phones.join('\n'));
  }, [company.data]);

  if (company.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (company.isError) return <LoadError error={company.error} onRetry={() => company.refetch()} />;
  if (!draft) return null;

  const errors = form.fieldErrors;
  const text = (key: TextKey, label: string, options: { hint?: string; mono?: boolean } = {}) => (
    <Field label={label} hint={options.hint} error={errors[key]}>
      <Input
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        className={options.mono ? 'font-mono' : undefined}
      />
    </Field>
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
      ...draft,
      phones: phones
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    };
    await form.run(
      () => expectStatus(api.catalog.updateCompany({ body }), 200),
      (saved) => {
        queryClient.setQueryData(SETTINGS_KEYS.company, saved);
        toast({ title: settingsT('saved'), reference: saved.brandName, tone: 'success' });
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <SettingsSection title={t('identity')}>
        {text('legalName', t('legalName'))}
        <div className="grid gap-5 sm:grid-cols-2">
          {text('brandName', t('brandName'))}
          {text('gstin', t('gstin'), { mono: true })}
        </div>
      </SettingsSection>
      <SettingsSection title={t('contact')}>
        <Field label={t('fullAddress')} error={errors.fullAddress}>
          <Textarea
            rows={3}
            value={draft.fullAddress}
            onChange={(event) => setDraft({ ...draft, fullAddress: event.target.value })}
          />
        </Field>
        {text('shortAddress', t('shortAddress'), { hint: t('shortAddressHint') })}
        <div className="grid gap-5 sm:grid-cols-2">
          {text('email', t('email'))}
          <Field label={t('phones')} hint={t('phonesHint')} error={errors.phones}>
            <Textarea rows={3} value={phones} onChange={(event) => setPhones(event.target.value)} />
          </Field>
        </div>
      </SettingsSection>
      <SettingsSection title={t('signatory')} description={t('signatoryHint')}>
        {draft.signatoryName.trim() === '' && (
          <p className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
            {t('signatoryMissing')}
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          {text('signatoryName', t('signatoryName'))}
          {text('signatoryDesignation', t('signatoryDesignation'))}
          {text('signatoryPhone', t('signatoryPhone'))}
          {text('signatoryEmail', t('signatoryEmail'))}
        </div>
      </SettingsSection>
      <CompanyAssetsSection />
      <ReportVisibilitySection />
      <SettingsSection title={t('documents')}>
        <Field
          label={t('quotationValidityDays')}
          error={errors.quotationValidityDays}
          className="max-w-xs"
        >
          <NumberInput
            unit="whole"
            value={draft.quotationValidityDays}
            onValueChange={(value) => setDraft({ ...draft, quotationValidityDays: value ?? 0 })}
          />
        </Field>
      </SettingsSection>
      <div className="flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-end">
        <FormError message={form.error} />
        <Button type="submit" variant="primary" pending={form.pending}>
          {settingsT('save')}
        </Button>
      </div>
    </form>
  );
}
