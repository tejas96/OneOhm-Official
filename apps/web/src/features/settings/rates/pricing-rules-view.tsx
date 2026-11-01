'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { SegmentedControl } from '@oneohm/design-system/web';
import { DEFAULT_SQM_PER_KWP, PRICING_MODES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { SettingsSection } from '../settings-section';
import { RowGroup, ValueRow } from './rate-rows';
import { SaveBar } from './save-bar';
import { useCardSaver } from './use-card-saver';

type Card = RateCardValues;
type ShareKey =
  | 'contingencyBp'
  | 'toleranceBp'
  | 'discountApprovalBp'
  | 'goodsTaxBp'
  | 'serviceTaxBp'
  | 'wastageBp'
  | 'overheadBp';

const RULES: readonly ShareKey[] = [
  'contingencyBp',
  'toleranceBp',
  'discountApprovalBp',
  'wastageBp',
];
const TAXES: readonly ShareKey[] = ['goodsTaxBp', 'serviceTaxBp'];

/** How cost becomes price, and the allowances and approvals around it (PRD 3.9 D). */
export function PricingRulesView({ card }: { readonly card: Card }) {
  const t = useTranslations('costing.rules');
  const { save, form } = useCardSaver();
  const [draft, setDraft] = useState(card);
  useEffect(() => setDraft(card), [card]);
  const errors = form.fieldErrors;
  const share = (key: ShareKey) => (
    <ValueRow
      key={key}
      label={t(`fields.${key}`)}
      hint={t(`hints.${key}`)}
      unit="basisPoints"
      value={draft[key] ?? 0}
      onChange={(value) => setDraft({ ...draft, [key]: value })}
      error={errors[key]}
    />
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={async (event) => {
        event.preventDefault();
        await save(draft);
      }}
    >
      <SettingsSection title={t('pricing')} description={t('pricingHint')}>
        <SegmentedControl
          label={t('pricing')}
          value={draft.pricing.mode}
          onValueChange={(mode) => setDraft({ ...draft, pricing: { ...draft.pricing, mode } })}
          options={PRICING_MODES.map((value) => ({ value, label: t(`modes.${value}`) }))}
          className="w-full sm:w-auto [&>*]:flex-1"
        />
        <p className="type-body-sm text-ink-muted">{t(`modeHints.${draft.pricing.mode}`)}</p>
        <RowGroup>
          <ValueRow
            label={t('fields.marginBp')}
            hint={t('hints.marginBp')}
            unit="basisPoints"
            value={draft.pricing.marginBp}
            onChange={(marginBp) => setDraft({ ...draft, pricing: { ...draft.pricing, marginBp } })}
            error={errors['pricing.marginBp']}
          />
          {share('overheadBp')}
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t('allowances')} description={t('allowancesHint')}>
        <RowGroup>
          {RULES.map(share)}
          <ValueRow
            label={t('fields.sqmPerKwp')}
            hint={t('hints.sqmPerKwp')}
            unit="whole"
            value={draft.sqmPerKwp ?? DEFAULT_SQM_PER_KWP}
            onChange={(sqmPerKwp) => setDraft({ ...draft, sqmPerKwp })}
            error={errors.sqmPerKwp}
          />
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t('taxes')}>
        <RowGroup>{TAXES.map(share)}</RowGroup>
      </SettingsSection>

      <SaveBar error={form.error} pending={form.pending} />
    </form>
  );
}
