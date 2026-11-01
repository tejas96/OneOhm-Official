'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { SettingsSection } from '../settings-section';
import { StarterNotice } from '../starter-notice';
import { SETTINGS_KEYS, useRateCard } from '../use-settings';
import { PairHeader, PairRow, RowGroup, ValueRow } from './rate-rows';

const STRUCTURES = ['rcc_elevated', 'tin_shed', 'ground_mount'] as const;
const CABLES = ['dcCable', 'acCable'] as const;
const KITS = [
  'earthingKit',
  'protectionKit',
  'installationPerKw',
  'extraFloorPerKw',
  'liaisoning',
] as const;
const RULES = [
  { key: 'contingencyBp', hint: 'contingencyHint' },
  { key: 'toleranceBp', hint: 'toleranceHint' },
  { key: 'discountApprovalBp', hint: 'discountApprovalHint' },
  { key: 'goodsTaxBp', hint: null },
  { key: 'serviceTaxBp', hint: null },
] as const;

/** The price engine's rates, grouped the way an estimator thinks about a job. */
export function RatesPanel() {
  const t = useTranslations('settings.rates');
  const settingsT = useTranslations('settings');
  const format = useFormatter();
  const card = useRateCard();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [rates, setRates] = useState<RateCardValues | null>(null);

  useEffect(() => {
    if (card.data) setRates(card.data.rates);
  }, [card.data]);

  if (card.isPending) return <ListSkeleton label={t('loading')} rows={5} />;
  if (card.isError) return <LoadError error={card.error} onRetry={() => card.refetch()} />;
  if (!rates) return null;

  const errors = form.fieldErrors;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await form.run(() =>
      expectStatus(api.catalog.updateRateCard({ body: rates }), 200),
    );
    if (!saved) return;
    queryClient.setQueryData(SETTINGS_KEYS.rateCard, saved);
    toast({ title: settingsT('saved'), reference: saved.name, tone: 'success' });
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-5xl flex-col gap-8">
      {card.data.starter && <StarterNotice>{settingsT('starter.rates')}</StarterNotice>}
      <div className="flex flex-col gap-1">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <p className="type-body-sm text-ink-faint">
          {card.data.name} ·{' '}
          {t('lastSaved', {
            date: format.dateTime(new Date(card.data.updatedAt), { dateStyle: 'medium' }),
          })}
        </p>
      </div>

      <SettingsSection title={t('groups.structure')}>
        <RowGroup>
          <PairHeader />
          {STRUCTURES.map((key) => (
            <PairRow
              key={key}
              label={t(`fields.${key}`)}
              path={`structurePerKw.${key}`}
              value={rates.structurePerKw[key]}
              onChange={(next) =>
                setRates({ ...rates, structurePerKw: { ...rates.structurePerKw, [key]: next } })
              }
              errors={errors}
            />
          ))}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t('groups.cables')}>
        {CABLES.map((key) => (
          <RowGroup key={key}>
            <PairHeader />
            <PairRow
              label={t(`fields.${key}`)}
              path={key}
              value={rates[key]}
              onChange={(next) => setRates({ ...rates, [key]: { ...rates[key], ...next } })}
              errors={errors}
            />
            {(['baseMeters', 'perFloorMeters'] as const).map((field) => (
              <ValueRow
                key={field}
                label={t(`fields.${field}`)}
                unit="whole"
                value={rates[key][field]}
                onChange={(value) =>
                  setRates({ ...rates, [key]: { ...rates[key], [field]: value } })
                }
                error={errors[`${key}.${field}`]}
              />
            ))}
          </RowGroup>
        ))}
      </SettingsSection>

      <SettingsSection title={t('groups.kits')}>
        <RowGroup>
          <PairHeader />
          {KITS.map((key) => (
            <PairRow
              key={key}
              label={t(`fields.${key}`)}
              path={key}
              value={rates[key]}
              onChange={(next) => setRates({ ...rates, [key]: next })}
              errors={errors}
            />
          ))}
          <ValueRow
            label={t('fields.freeFloors')}
            unit="whole"
            value={rates.freeFloors}
            onChange={(freeFloors) => setRates({ ...rates, freeFloors })}
            error={errors.freeFloors}
          />
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t('groups.transport')}>
        <RowGroup>
          {(['baseKm', 'perKm', 'flat'] as const).map((field) => (
            <ValueRow
              key={field}
              label={t(`fields.${field}`)}
              unit={field === 'baseKm' ? 'whole' : 'paise'}
              value={rates.transport[field]}
              onChange={(value) =>
                setRates({ ...rates, transport: { ...rates.transport, [field]: value } })
              }
              error={errors[`transport.${field}`]}
            />
          ))}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t('groups.rules')}>
        <RowGroup>
          {RULES.map((rule) => (
            <ValueRow
              key={rule.key}
              label={t(`fields.${rule.key}`)}
              hint={rule.hint ? t(`fields.${rule.hint}`) : undefined}
              unit="basisPoints"
              value={rates[rule.key]}
              onChange={(value) => setRates({ ...rates, [rule.key]: value })}
              error={errors[rule.key]}
            />
          ))}
        </RowGroup>
      </SettingsSection>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl bg-raised/90 p-4 shadow-e3 ring-1 ring-hairline backdrop-blur sm:flex-row sm:items-center sm:justify-end">
        <FormError message={form.error} />
        <Button type="submit" variant="primary" pending={form.pending}>
          {settingsT('save')}
        </Button>
      </div>
    </form>
  );
}
