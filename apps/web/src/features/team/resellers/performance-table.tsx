'use client';

import type { ResellerPerformance } from '@oneohm/api-contracts';
import { Badge, Button, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { percent, ruleSummary } from './rule-summary';

/** One row per reseller: leads, conversion, value sold, commission and their rule. */
export function PerformanceTable({
  rows,
  canConfigure,
  onEditRule,
}: {
  readonly rows: readonly ResellerPerformance[];
  readonly canConfigure: boolean;
  readonly onEditRule: (row: ResellerPerformance) => void;
}) {
  const t = useTranslations('team.resellers');
  const columns: TableColumn<ResellerPerformance>[] = [
    {
      key: 'reseller',
      header: t('columns.reseller'),
      primary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="flex items-center gap-2 type-body font-medium text-ink">
            {row.reseller.fullName}
            {!row.reseller.active && <Badge variant="soft">{t('inactive')}</Badge>}
          </span>
          {row.reseller.phone && (
            <span className="font-mono text-[0.75rem] text-ink-faint">{row.reseller.phone}</span>
          )}
        </span>
      ),
    },
    {
      key: 'leads',
      header: t('columns.leads'),
      cell: (row) => (
        <span className="flex flex-col type-body-sm whitespace-nowrap">
          <span className="text-ink tabular-nums">{t('leadsCount', { count: row.leads })}</span>
          <span className="text-ink-faint">{t('openCount', { count: row.openLeads })}</span>
        </span>
      ),
    },
    {
      key: 'conversion',
      header: t('columns.conversion'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col type-body-sm whitespace-nowrap">
          <span className="font-mono text-ink tabular-nums">{`${percent(row.conversionBp)}%`}</span>
          <span className="text-ink-faint">{t('wonLost', { won: row.won, lost: row.lost })}</span>
        </span>
      ),
    },
    {
      key: 'sold',
      header: t('columns.sold'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col type-body-sm whitespace-nowrap">
          <span className="font-mono text-ink tabular-nums">{formatInr(row.valueSoldPaise)}</span>
          <span className="text-ink-faint">
            {t('projectsSold', { count: row.projects, size: formatKwp(row.capacitySoldWp) })}
          </span>
        </span>
      ),
    },
    {
      key: 'commission',
      header: t('columns.commission'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col type-body-sm whitespace-nowrap">
          <span className="font-mono text-ink tabular-nums">
            {formatInr(row.totals.earnedPaise)}
          </span>
          <span className="text-ink-faint">
            {t('commissionSplit', {
              open: formatInr(row.totals.pendingPaise + row.totals.approvedPaise),
              paid: formatInr(row.totals.paidPaise),
            })}
          </span>
        </span>
      ),
    },
    {
      key: 'rule',
      header: t('columns.rule'),
      cell: (row) => (
        <span className="flex flex-col items-start gap-1.5">
          <span className="type-body-sm text-ink-muted">{ruleSummary(t, row.rule)}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={row.customRule ? 'accent' : 'outline'}>
              {row.customRule ? t('ownRule') : t('defaultRule')}
            </Badge>
            {canConfigure && (
              <Button
                size="sm"
                variant="quiet"
                leadingIcon={<PencilLine />}
                onClick={() => onEditRule(row)}
              >
                {row.customRule ? t('editRule') : t('setRule')}
              </Button>
            )}
          </span>
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.reseller.id}
    />
  );
}
