'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  Select,
  type TableColumn,
} from '@oneohm/design-system/web';
import { type CostingCard, RATE_KINDS, type RateKind, rateUses } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { Plus, Ruler } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RateLineSheet } from './rate-line-sheet';

type RateLine = RateCardValues['rateLines'][number];
const ALL = 'all';

const margin = (line: RateLine) =>
  line.pricePaise > 0
    ? `${(((line.pricePaise - line.costPaise) / line.pricePaise) * 100).toFixed(0)}%`
    : '—';

/** Every rate the engine prices with; add one here and it can be used anywhere, no code. */
export function RateLinesView({ card }: { readonly card: RateCardValues }) {
  const t = useTranslations('costing.lines');
  const kindT = useTranslations('costing.kinds');
  const [kind, setKind] = useState<RateKind | typeof ALL>(ALL);
  const [editing, setEditing] = useState<RateLine | null>(null);
  const [adding, setAdding] = useState(false);
  const visible = card.rateLines.filter((line) => kind === ALL || line.kind === kind);

  const usedIn = (line: RateLine) => {
    const uses = rateUses(card as CostingCard, line.key);
    if (uses.length === 0) return <span className="text-ink-faint">{t('unused')}</span>;
    if (uses.some((use) => use.site === null)) return t('everyJob');
    return t('sites', { count: new Set(uses.map((use) => use.site)).size });
  };

  const columns: readonly TableColumn<RateLine>[] = [
    {
      key: 'rate',
      header: t('columns.rate'),
      primary: true,
      cell: (line) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => setEditing(line)}
            className="oh-stretched-link truncate text-left type-body font-medium text-ink hover:text-accent"
          >
            {line.label}
          </button>
          <span className="flex items-center gap-2 font-mono text-[0.75rem] text-ink-faint">
            {line.key}
            {line.productId && <Badge variant="outline">{t('fromCatalog')}</Badge>}
          </span>
        </span>
      ),
    },
    { key: 'kind', header: t('columns.kind'), cell: (line) => kindT(line.kind) },
    {
      key: 'price',
      header: t('columns.price'),
      align: 'end',
      cell: (line) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatInr(line.pricePaise)}
          <span className="text-ink-faint"> / {line.unit}</span>
        </span>
      ),
    },
    {
      key: 'cost',
      header: t('columns.cost'),
      align: 'end',
      hideOnPhone: true,
      cell: (line) => (
        <span className="text-ink-muted tabular-nums">{formatInr(line.costPaise)}</span>
      ),
    },
    {
      key: 'margin',
      header: t('columns.margin'),
      align: 'end',
      hideOnPhone: true,
      cell: (line) => <span className="font-mono text-ink-muted">{margin(line)}</span>,
    },
    { key: 'used', header: t('columns.used'), cell: usedIn },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl type-body-sm text-ink-muted">{t('intro')}</p>
        <Button variant="primary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
          {t('add')}
        </Button>
      </div>
      <Select
        value={kind}
        onValueChange={setKind}
        label={t('columns.kind')}
        className="sm:w-56"
        options={[
          { value: ALL, label: t('allKinds') },
          ...RATE_KINDS.filter((value) => card.rateLines.some((line) => line.kind === value)).map(
            (value) => ({ value, label: kindT(value) }),
          ),
        ]}
      />
      {visible.length === 0 ? (
        <EmptyState icon={<Ruler />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={visible}
          rowKey={(line) => line.key}
        />
      )}
      <RateLineSheet
        card={card}
        open={adding || editing !== null}
        line={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
