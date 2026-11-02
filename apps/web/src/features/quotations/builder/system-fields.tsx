'use client';

import type { Product } from '@oneohm/api-contracts';
import { cn, Field, Input, SearchSelect, SegmentedControl } from '@oneohm/design-system/web';
import { formatWp } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { productOptions, useSearchWords } from '@/components/product-search';
import { InverterRowsField } from '../inverter-rows';
import { dcCapacityWp } from '../inverter-rows-state';
import type { BuilderState, SubsidyCategory, SystemType } from './builder-state';

const CATEGORIES: readonly SubsidyCategory[] = ['individual', 'society', 'commercial'];
const SYSTEM_TYPES: readonly SystemType[] = ['on_grid', 'hybrid', 'off_grid'];
const QUICK_SIZES = ['2', '3', '5', '10'] as const;
const NO_BATTERY = 'none';

export interface Catalog {
  readonly panels: readonly Product[];
  readonly inverters: readonly Product[];
  readonly batteries: readonly Product[];
}

type Patch = (patch: Partial<BuilderState>) => void;

/** Category, system type, size and the three products (PRD 3.5 steps 1 and 2). */
export function SystemFields({
  state,
  patch,
  catalog,
  errors,
}: {
  readonly state: BuilderState;
  readonly patch: Patch;
  readonly catalog: Catalog;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('quotations.builder.system');
  const categoryT = useTranslations('quotations.category');
  const typeT = useTranslations('quotations.systemType');
  const words = useSearchWords();
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={t('category')} hint={t('categoryHint')}>
          <SegmentedControl
            label={t('category')}
            value={state.subsidyCategory}
            onValueChange={(value) => patch({ subsidyCategory: value })}
            options={CATEGORIES.map((value) => ({ value, label: categoryT(value) }))}
            className="w-full [&>*]:flex-1"
          />
        </Field>
        <Field label={t('systemType')} hint={t(`systemTypeHint.${state.systemType}`)}>
          <SegmentedControl
            label={t('systemType')}
            value={state.systemType}
            onValueChange={(value) => patch({ systemType: value })}
            options={SYSTEM_TYPES.map((value) => ({ value, label: typeT(value) }))}
            className="w-full [&>*]:flex-1"
          />
        </Field>
      </div>

      {state.subsidyCategory === 'society' && (
        <Field label={t('households')} hint={t('householdsHint')} error={errors.households}>
          <Input
            inputMode="numeric"
            value={state.households}
            onChange={(event) => patch({ households: event.target.value.replace(/\D/g, '') })}
            className="max-w-48"
          />
        </Field>
      )}

      <Field label={t('size')} hint={t('sizeHint')} error={errors.targetWp} required>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            inputMode="decimal"
            value={state.targetKw}
            onChange={(event) => patch({ targetKw: event.target.value.replace(/[^\d.]/g, '') })}
            trailing={<span className="pr-2 type-body-sm text-ink-faint">kWp</span>}
            className="w-40 font-mono"
          />
          {QUICK_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => patch({ targetKw: size })}
              aria-pressed={state.targetKw === size}
              className={cn(
                'h-9 rounded-full border px-3.5 font-mono text-[0.8125rem] transition-colors',
                state.targetKw === size
                  ? 'border-accent bg-accent-soft text-on-accent-soft'
                  : 'border-hairline bg-raised text-ink-muted hover:border-rule hover:text-ink',
              )}
            >
              {size} kW
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label={t('panel')} hint={t('panelHint')} error={errors.panelProductId} required>
          <SearchSelect
            {...words}
            value={state.panelProductId ?? undefined}
            onValueChange={(value) => patch({ panelProductId: value, panelChosen: true })}
            options={productOptions(
              catalog.panels,
              (product) =>
                `${formatWp(product.wattageWp ?? 0)} · ${product.dcr ? 'DCR' : t('nonDcr')}`,
            )}
          />
        </Field>
      </div>

      <InverterRowsField
        rows={state.inverters}
        onChange={(inverters) => patch({ inverters, inverterChosen: true })}
        inverters={catalog.inverters}
        capacityWp={dcCapacityWp(
          state.targetKw,
          catalog.panels.find((panel) => panel.id === state.panelProductId),
        )}
        error={inverterError(errors)}
        hint={state.inverterChosen ? undefined : t('inverterHint')}
      />

      {state.systemType !== 'on_grid' && (
        <Field label={t('battery')} hint={t('batteryHint')} error={errors.batteryProductId}>
          <SearchSelect
            {...words}
            value={state.batteryProductId ?? NO_BATTERY}
            onValueChange={(value) =>
              patch({ batteryProductId: value === NO_BATTERY ? null : value })
            }
            options={[
              { value: NO_BATTERY, label: t('noBattery') },
              ...productOptions(catalog.batteries),
            ]}
            className="md:max-w-[calc(50%-0.625rem)]"
          />
        </Field>
      )}
    </div>
  );
}

/** The API names inverter problems by row (`inverters.1.productId`) or as a whole. */
export function inverterError(errors: Readonly<Record<string, string>>): string | undefined {
  return (
    errors.inverters ??
    errors.inverterProductId ??
    Object.entries(errors).find(([key]) => key.startsWith('inverters.'))?.[1]
  );
}

/** Catalog names as sales say them; the starter catalog has no real brand yet. */
export function productName(product: Product): string {
  return product.brand && product.brand !== 'Starter catalog'
    ? `${product.brand} ${product.name}`
    : product.name;
}
