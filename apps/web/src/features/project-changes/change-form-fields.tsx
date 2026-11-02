'use client';

import type { ExtraLineInput } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  SearchSelect,
  Select,
} from '@oneohm/design-system/web';
import { STRUCTURE_TYPES } from '@oneohm/domain';
import { formatInr, formatWp } from '@oneohm/shared';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { productOptions, useSearchWords } from '@/components/product-search';
import { ExtraLineSheet } from '@/features/quotations/builder/extra-line-sheet';
import { type Catalog, inverterError } from '@/features/quotations/builder/system-fields';
import { InverterRowsField } from '@/features/quotations/inverter-rows';
import { dcCapacityWp } from '@/features/quotations/inverter-rows-state';
import type { ChangeDraft } from './change-draft';

const NO_BATTERY = 'none';

type Patch = (patch: Partial<ChangeDraft>) => void;

/** Lines already on the quotation (they stay) and the ones this change adds. */
function ExtraLines({
  kept,
  added,
  onChange,
}: {
  readonly kept: readonly ExtraLineInput[];
  readonly added: readonly ExtraLineInput[];
  readonly onChange: (added: readonly ExtraLineInput[]) => void;
}) {
  const t = useTranslations('scopeChanges.form');
  const kindT = useTranslations('quotations.extras.kinds');
  const [adding, setAdding] = useState(false);
  const row = (line: ExtraLineInput) => (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Badge variant="soft" className="py-0">
        {kindT(line.kind)}
      </Badge>
      <span className="type-body-sm text-ink">{line.description}</span>
      <span className="font-mono text-[0.75rem] text-ink-faint">
        {formatInr(Math.round(line.quantity * line.unitPricePaise))}
      </span>
    </span>
  );
  return (
    <Field label={t('extras')} hint={t('extrasHint')}>
      <div className="flex flex-col gap-2">
        {kept.length + added.length > 0 && (
          <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline">
            {kept.map((line) => (
              <li
                key={`kept-${line.description}`}
                className="flex items-center gap-2 px-3 py-2 opacity-70"
              >
                {row(line)}
              </li>
            ))}
            {added.map((line, index) => (
              <li
                key={`new-${index}-${line.description}`}
                className="flex items-center gap-2 px-3 py-2"
              >
                {row(line)}
                <IconButton
                  label={t('removeExtra', { item: line.description })}
                  size="sm"
                  variant="quiet"
                  onClick={() => onChange(added.filter((_, at) => at !== index))}
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Plus />}
          className="self-start"
          onClick={() => setAdding(true)}
        >
          {t('addExtra')}
        </Button>
        <ExtraLineSheet
          open={adding}
          onClose={() => setAdding(false)}
          onAdd={(line) => onChange([...added, line])}
        />
      </div>
    </Field>
  );
}

/** Size, the three products, structure and new lines: what a scope change can move. */
export function ChangeFormFields({
  draft,
  patch,
  catalog,
  keptExtras,
  errors,
}: {
  readonly draft: ChangeDraft;
  readonly patch: Patch;
  readonly catalog: Catalog;
  readonly keptExtras: readonly ExtraLineInput[];
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('scopeChanges.form');
  const words = useSearchWords();
  const structureT = useTranslations('quotations.structure');
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('size')} error={errors.targetWp}>
          <Input
            inputMode="decimal"
            value={draft.targetKw}
            onChange={(event) => patch({ targetKw: event.target.value.replace(/[^\d.]/g, '') })}
            trailing={<span className="pr-2 type-body-sm text-ink-faint">kWp</span>}
            className="font-mono"
          />
        </Field>
        <Field label={t('structure')} error={errors.structureType}>
          <Select
            value={draft.structureType}
            onValueChange={(value) => patch({ structureType: value })}
            options={STRUCTURE_TYPES.map((value) => ({ value, label: structureT(value) }))}
          />
        </Field>
      </div>
      <Field label={t('panel')} hint={t('panelHint')} error={errors.panelProductId}>
        <SearchSelect
          {...words}
          value={draft.panelProductId}
          onValueChange={(value) => patch({ panelProductId: value })}
          options={productOptions(
            catalog.panels,
            (product) =>
              `${formatWp(product.wattageWp ?? 0)} · ${product.dcr ? t('dcr') : t('nonDcr')}`,
          )}
        />
      </Field>
      <InverterRowsField
        rows={draft.inverters}
        onChange={(inverters) => patch({ inverters })}
        inverters={catalog.inverters}
        capacityWp={dcCapacityWp(
          draft.targetKw,
          catalog.panels.find((panel) => panel.id === draft.panelProductId),
        )}
        error={inverterError(errors)}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('battery')} error={errors.batteryProductId}>
          <SearchSelect
            {...words}
            value={draft.batteryProductId ?? NO_BATTERY}
            onValueChange={(value) =>
              patch({ batteryProductId: value === NO_BATTERY ? null : value })
            }
            options={[
              { value: NO_BATTERY, label: t('noBattery') },
              ...productOptions(catalog.batteries),
            ]}
          />
        </Field>
      </div>
      <ExtraLines
        kept={keptExtras}
        added={draft.newExtras}
        onChange={(newExtras) => patch({ newExtras })}
      />
    </div>
  );
}
