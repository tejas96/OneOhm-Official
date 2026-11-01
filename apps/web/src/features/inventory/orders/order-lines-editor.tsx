'use client';

import type { Product } from '@oneohm/api-contracts';
import { Button, Field, IconButton, Input, Select } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { PackagePlus, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/features/settings/number-input';

export interface LineDraft {
  readonly key: string;
  /** Catalog products are stocked; other items (site-specific) are only bought. */
  readonly kind: 'product' | 'item';
  readonly productId: string | null;
  readonly description: string;
  readonly unit: string;
  readonly quantity: string;
  readonly ratePaise: number | null;
  readonly taxRateBp: number | null;
}

let counter = 0;
export const newLineKey = () => {
  counter += 1;
  return `line-${counter}`;
};

/** Same rounding as the API: amount to the paisa, then GST on it. */
export function lineTotal(line: LineDraft): number {
  const quantity = Number(line.quantity.replace(/,/g, '')) || 0;
  const amount = Math.round(quantity * (line.ratePaise ?? 0));
  return amount + Math.round((amount * (line.taxRateBp ?? 0)) / 10_000);
}

/** The lines of a purchase order: catalog products (stocked) or other site items. */
export function OrderLinesEditor({
  lines,
  products,
  errors,
  onChange,
}: {
  readonly lines: readonly LineDraft[];
  readonly products: readonly Product[];
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (lines: LineDraft[]) => void;
}) {
  const t = useTranslations('inventory.orderForm');
  const update = (key: string, patch: Partial<LineDraft>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const pick = (key: string, productId: string) => {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;
    update(key, {
      productId,
      description: product.name,
      unit: product.unit,
      ratePaise: product.costPaise,
      taxRateBp: product.taxRateBp,
    });
  };
  const add = (kind: LineDraft['kind']) =>
    onChange([
      ...lines,
      {
        key: newLineKey(),
        kind,
        productId: null,
        description: '',
        unit: kind === 'product' ? 'nos' : 'set',
        quantity: '1',
        ratePaise: null,
        taxRateBp: kind === 'product' ? null : 1800,
      },
    ]);

  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => (
        <div
          key={line.key}
          className="relative grid gap-3 rounded-2xl border border-hairline bg-surface/60 p-4 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.4fr)_6.5rem]"
        >
          <div className="flex flex-col gap-2 sm:col-span-4">
            {line.kind === 'product' && (
              <Field label={t('item')} error={errors[`lines.${index}.productId`]}>
                <Select
                  value={line.productId ?? undefined}
                  onValueChange={(value) => pick(line.key, value)}
                  placeholder={t('productPlaceholder')}
                  options={products.map((product) => ({ value: product.id, label: product.name }))}
                  label={t('item')}
                />
              </Field>
            )}
            <Field label={t('itemDescription')} error={errors[`lines.${index}.description`]}>
              <Input
                value={line.description}
                onChange={(event) => update(line.key, { description: event.target.value })}
              />
            </Field>
          </div>
          <Field label={t('unit')} error={errors[`lines.${index}.unit`]}>
            <Input
              value={line.unit}
              onChange={(event) => update(line.key, { unit: event.target.value })}
            />
          </Field>
          <Field label={t('quantity')} error={errors[`lines.${index}.quantity`]}>
            <Input
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) => update(line.key, { quantity: event.target.value })}
            />
          </Field>
          <Field label={t('rate')} error={errors[`lines.${index}.ratePaise`]}>
            <NumberInput
              unit="paise"
              value={line.ratePaise}
              onValueChange={(value) => update(line.key, { ratePaise: value })}
            />
          </Field>
          <Field label={t('gst')} error={errors[`lines.${index}.taxRateBp`]}>
            <NumberInput
              unit="basisPoints"
              value={line.taxRateBp}
              onValueChange={(value) => update(line.key, { taxRateBp: value })}
            />
          </Field>
          <p className="flex items-center justify-between type-body-sm text-ink-muted sm:col-span-4">
            <span>{t('lineTotal')}</span>
            <span className="font-medium text-ink tabular-nums">{formatInr(lineTotal(line))}</span>
          </p>
          <IconButton
            label={t('removeLine')}
            variant="quiet"
            size="sm"
            className="absolute top-2 right-2"
            onClick={() => onChange(lines.filter((entry) => entry.key !== line.key))}
          >
            <X />
          </IconButton>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<PackagePlus />}
          onClick={() => add('product')}
        >
          {t('addProduct')}
        </Button>
        <Button variant="quiet" size="sm" leadingIcon={<Plus />} onClick={() => add('item')}>
          {t('addItem')}
        </Button>
      </div>
    </div>
  );
}
