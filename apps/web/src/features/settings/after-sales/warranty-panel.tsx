'use client';

import type { WarrantyPolicyInput } from '@oneohm/api-contracts';
import { Button, Field, useToast } from '@oneohm/design-system/web';
import { ASSET_KINDS, type AssetKind } from '@oneohm/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { AFTER_SALES_KEYS, useWarranty } from './use-after-sales-settings';

function KindRow({
  kind,
  term,
  onChange,
  errors,
}: {
  readonly kind: AssetKind;
  readonly term: WarrantyPolicyInput[AssetKind];
  readonly onChange: (term: WarrantyPolicyInput[AssetKind]) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('afterSales.warranty');
  return (
    <SettingsSection title={t(`kinds.${kind}`)} description={t(`hints.${kind}`)}>
      <div className="grid max-w-xl gap-5 sm:grid-cols-2">
        <Field label={t('years')} error={errors[`${kind}.years`]}>
          <NumberInput
            unit="whole"
            value={term.years}
            onValueChange={(years) => onChange({ ...term, years: years ?? 0 })}
          />
        </Field>
        {kind === 'panel' && (
          <Field label={t('performanceYears')} error={errors[`${kind}.performanceYears`]}>
            <NumberInput
              unit="whole"
              value={term.performanceYears}
              onValueChange={(years) => onChange({ ...term, performanceYears: years })}
            />
          </Field>
        )}
      </div>
    </SettingsSection>
  );
}

/** Settings → Warranty: years of cover per part of the system, from commissioning. */
export function WarrantyPanel() {
  const t = useTranslations('afterSales.warranty');
  const settingsT = useTranslations('settings');
  const format = useFormatter();
  const now = useNow();
  const query = useWarranty();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useApiForm();
  const [draft, setDraft] = useState<WarrantyPolicyInput | null>(null);

  useEffect(() => {
    if (query.data && !draft) setDraft(query.data.policy);
  }, [query.data, draft]);

  if (query.isPending) return <ListSkeleton label={t('loading')} rows={5} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (!draft) return null;

  const saved = query.data;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.policy);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () => expectStatus(api.afterSales.saveWarrantyPolicy({ body: draft }), 200),
      (result) => {
        queryClient.setQueryData(AFTER_SALES_KEYS.warranty, result);
        setDraft(result.policy);
        toast({ title: settingsT('saved'), reference: t('title'), tone: 'success' });
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="type-display-md text-ink">{t('title')}</h2>
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <p className="type-body-sm text-ink-faint">
          {saved.updatedBy
            ? t('updated', {
                time: format.relativeTime(new Date(saved.updatedAt), now),
                name: saved.updatedBy,
              })
            : t('starter')}
        </p>
      </div>
      {ASSET_KINDS.map((kind) => (
        <KindRow
          key={kind}
          kind={kind}
          term={draft[kind]}
          onChange={(term) => setDraft({ ...draft, [kind]: term })}
          errors={form.fieldErrors}
        />
      ))}
      <div className="flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-end">
        <FormError message={form.error} />
        <p className="type-body-sm text-ink-faint sm:mr-auto">
          {dirty ? t('unsaved') : t('applies')}
        </p>
        {dirty && (
          <Button
            variant="quiet"
            onClick={() => {
              setDraft(saved.policy);
              form.reset();
            }}
          >
            {t('discard')}
          </Button>
        )}
        <Button type="submit" variant="primary" pending={form.pending} disabled={!dirty}>
          {settingsT('save')}
        </Button>
      </div>
    </form>
  );
}
