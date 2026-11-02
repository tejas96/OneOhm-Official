'use client';

import type { QuotationInput } from '@oneohm/api-contracts';
import { inverterPicks, inverterSummary } from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { productName } from '../builder/system-fields';
import { useCatalog } from '../builder/use-builder';

/** What was quoted, in plain words: the products and the site assumptions behind the price. */
export function SystemFacts({
  input,
  capacityWp,
}: {
  readonly input: QuotationInput;
  readonly capacityWp: number;
}) {
  const t = useTranslations('quotations.facts');
  const categoryT = useTranslations('quotations.category');
  const typeT = useTranslations('quotations.systemType');
  const structureT = useTranslations('quotations.structure');
  const costingT = useTranslations('costing.facts');
  const catalog = useCatalog();
  const all = catalog.data
    ? [...catalog.data.panels, ...catalog.data.inverters, ...catalog.data.batteries]
    : [];
  const name = (id: string | null | undefined) => {
    const product = id ? all.find((entry) => entry.id === id) : undefined;
    return product ? productName(product) : t('unknownProduct');
  };
  const panel = all.find((entry) => entry.id === input.panelProductId);
  const runs = input.costing?.runs?.length ?? 0;
  const where = [input.costing?.arrayLocation, input.costing?.inverterLocation].filter(Boolean);
  const cables = runs
    ? costingT('runsMeasured', { count: runs })
    : input.dcCableMeters || input.acCableMeters
      ? t('cablesMeasured', { dc: input.dcCableMeters ?? 0, ac: input.acCableMeters ?? 0 })
      : t('cablesDefault');
  return (
    <dl className="grid gap-x-10 sm:grid-cols-2">
      <Fact label={t('size')} value={<span className="font-mono">{formatKwp(capacityWp)}</span>} />
      <Fact label={t('systemType')} value={typeT(input.systemType)} />
      <Fact
        label={t('category')}
        value={
          input.households
            ? `${categoryT(input.subsidyCategory)} · ${t('households', { count: input.households })}`
            : categoryT(input.subsidyCategory)
        }
      />
      <Fact
        label={t('panel')}
        value={panel ? `${name(panel.id)} · ${panel.dcr ? 'DCR' : t('nonDcr')}` : name(null)}
      />
      <Fact label={t('inverter')} value={inverterSummary(inverterPicks(input), (id) => name(id))} />
      {input.batteryProductId && <Fact label={t('battery')} value={name(input.batteryProductId)} />}
      <Fact label={t('structure')} value={structureT(input.structureType)} />
      <Fact
        label={t('site')}
        value={t('siteValue', { floors: input.floors, km: input.distanceKm })}
      />
      <Fact label={t('cables')} value={cables} />
      {where.length > 0 && <Fact label={costingT('locations')} value={where.join(' · ')} />}
    </dl>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-3">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="text-right type-body-sm text-ink">{value}</dd>
    </div>
  );
}
