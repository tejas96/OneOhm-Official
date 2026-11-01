'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { STRUCTURE_TYPES, type StructureType } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SiteTypeSheet } from './site-type-sheet';

interface Row {
  readonly type: StructureType;
  readonly site: RateCardValues['sites'][StructureType];
}

/**
 * What a quick quote assumes about each kind of site until the survey measures it
 * (PRD 3.9): the structure and its parts, the cable routes, the crew and equipment.
 */
export function SiteTypesView({ card }: { readonly card: RateCardValues }) {
  const t = useTranslations('costing.sites');
  const routeT = useTranslations('costing.routes');
  const [editing, setEditing] = useState<StructureType | null>(null);
  const label = (key: string) => card.rateLines.find((line) => line.key === key)?.label ?? key;

  const columns: readonly TableColumn<Row>[] = [
    {
      key: 'type',
      header: t('columns.type'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => setEditing(row.type)}
            className="oh-stretched-link truncate text-left type-body font-medium text-ink hover:text-accent"
          >
            {t(`types.${row.type}`)}
          </button>
          <span className="truncate type-body-sm text-ink-faint">{row.site.label}</span>
        </span>
      ),
    },
    {
      key: 'structure',
      header: t('columns.structure'),
      cell: (row) =>
        row.site.parts.length > 0
          ? t('parts', { count: row.site.parts.length })
          : t('perKw', { price: formatInr(row.site.perKw.pricePaise) }),
    },
    {
      key: 'routes',
      header: t('columns.routes'),
      hideOnPhone: true,
      cell: (row) => (
        <span className="flex flex-col type-body-sm text-ink-muted">
          {row.site.routes.map((route, index) => (
            <span key={index} className="whitespace-nowrap">
              {t('route', {
                kind: routeT(route.kind),
                across: route.acrossM,
                up: route.upPerFloorM,
                runs: route.runs,
              })}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'crew',
      header: t('columns.crew'),
      cell: (row) =>
        row.site.crew.length > 0
          ? t('crew', {
              people: row.site.crew.reduce((sum, member) => sum + member.workers, 0),
              pace: row.site.kwPerDay,
            })
          : t('noCrew'),
    },
    {
      key: 'equipment',
      header: t('columns.equipment'),
      hideOnPhone: true,
      cell: (row) =>
        row.site.equipment.length > 0
          ? row.site.equipment.map((item) => label(item.rate)).join(', ')
          : '—',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl type-body-sm text-ink-muted">{t('intro')}</p>
      <ResponsiveTable
        caption={t('caption')}
        columns={columns}
        rows={STRUCTURE_TYPES.map((type) => ({ type, site: card.sites[type] }))}
        rowKey={(row) => row.type}
      />
      <SiteTypeSheet card={card} type={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
