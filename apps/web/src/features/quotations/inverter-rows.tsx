'use client';

import type { Product } from '@oneohm/api-contracts';
import { Button, Field, IconButton, Input, SearchSelect } from '@oneohm/design-system/web';
import { inverterFit } from '@oneohm/domain';
import { CircleAlert, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { catalogName, productOptions, useSearchWords } from '@/components/product-search';
import {
  EMPTY_INVERTER_ROW,
  type InverterRow,
  MAX_INVERTER_MODELS,
  rowsTotalW,
} from './inverter-rows-state';

const kw = (watts: number) => `${Number((watts / 1000).toFixed(2)).toLocaleString('en-IN')} kW`;

/**
 * The inverters of a quotation: one row per model with how many, more rows for a mix
 * ("50 kW + 30 kW"). Shows the total AC rating against the panels and warns when they
 * do not fit; the warning never blocks.
 */
export function InverterRowsField({
  rows,
  onChange,
  inverters,
  capacityWp,
  error,
  hint,
}: {
  readonly rows: readonly InverterRow[];
  readonly onChange: (rows: InverterRow[]) => void;
  readonly inverters: readonly Product[];
  /** The panels' DC size, to check the inverters against; 0 when not known yet. */
  readonly capacityWp: number;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
}) {
  const t = useTranslations('quotations.inverters');
  const words = useSearchWords();
  const options = useMemo(
    () => productOptions(inverters, (product) => (product.ratedW ? kw(product.ratedW) : undefined)),
    [inverters],
  );
  const shown = rows.length > 0 ? rows : [EMPTY_INVERTER_ROW];
  const update = (index: number, next: Partial<InverterRow>) =>
    onChange(shown.map((row, at) => (at === index ? { ...row, ...next } : row)));
  const totalW = rowsTotalW(shown, inverters);
  const fit = inverterFit(capacityWp, totalW);
  return (
    <Field label={t('label')} hint={error ? undefined : hint} error={error} required>
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {shown.map((row, index) => {
            const product = inverters.find((entry) => entry.id === row.productId);
            const rowName = product ? catalogName(product) : t('row', { index: index + 1 });
            return (
              // Rows have no id of their own; their place is their identity.
              <li key={index} className="flex items-center gap-2">
                <SearchSelect
                  {...words}
                  label={t('model', { index: index + 1 })}
                  value={row.productId ?? undefined}
                  onValueChange={(productId) => update(index, { productId })}
                  options={options}
                  className="min-w-0 flex-1"
                />
                <span aria-hidden className="type-body-sm text-ink-faint">
                  ×
                </span>
                <Input
                  aria-label={t('count', { name: rowName })}
                  inputMode="numeric"
                  value={row.quantity}
                  onChange={(event) =>
                    update(index, { quantity: event.target.value.replace(/\D/g, '').slice(0, 2) })
                  }
                  className="w-16 text-center font-mono"
                />
                {shown.length > 1 && (
                  <IconButton
                    label={t('remove', { name: rowName })}
                    size="sm"
                    variant="quiet"
                    onClick={() => onChange(shown.filter((_, at) => at !== index))}
                  >
                    <X />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="quiet"
            size="sm"
            disabled={shown.length >= MAX_INVERTER_MODELS}
            onClick={() => onChange([...shown, EMPTY_INVERTER_ROW])}
          >
            <Plus aria-hidden />
            {t('add')}
          </Button>
          {totalW > 0 && (
            <span className="type-body-sm text-ink-muted tabular-nums">
              {capacityWp > 0
                ? t('totalAgainst', { ac: kw(totalW), dc: kw(capacityWp) })
                : t('total', { ac: kw(totalW) })}
            </span>
          )}
        </div>
        {(fit === 'small' || fit === 'large') && (
          <p className="flex items-start gap-1.5 rounded-md bg-at-risk-tint px-3 py-2 type-body-sm text-at-risk">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t(`fit.${fit}`)}
          </p>
        )}
      </div>
    </Field>
  );
}
