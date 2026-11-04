'use client';

import type { SalesReport } from '@oneohm/api-contracts';
import { Card, CardHeader, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NUM } from '../parts/report-body';
import { money } from '../parts/report-format';

type CampaignRow = SalesReport['byCampaign'][number];

/** The period's leads by the ad or campaign that brought them, down to money collected. */
export function SalesByCampaign({ rows }: { readonly rows: readonly CampaignRow[] }) {
  const t = useTranslations('salesReport.tables');
  const columns: TableColumn<CampaignRow>[] = [
    {
      key: 'campaign',
      header: t('campaign'),
      primary: true,
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.key === 'none' ? t('noCampaign') : row.label}
        </span>
      ),
    },
    {
      key: 'leads',
      header: t('leads'),
      align: 'end',
      cell: (row) => <span className={NUM}>{row.leads}</span>,
    },
    {
      key: 'estimates',
      header: t('estimates'),
      align: 'end',
      cell: (row) => <span className={NUM}>{row.estimates}</span>,
    },
    {
      key: 'quoted',
      header: t('quoted'),
      align: 'end',
      cell: (row) => <span className={NUM}>{row.quoted}</span>,
    },
    {
      key: 'won',
      header: t('won'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col items-end whitespace-nowrap">
          <span className={`${NUM} text-ink`}>{money(row.wonValuePaise)}</span>
          <span className="type-body-sm text-ink-faint">{t('orders', { count: row.won })}</span>
        </span>
      ),
    },
    {
      key: 'advancePaid',
      header: t('advancePaid'),
      align: 'end',
      cell: (row) => <span className={NUM}>{row.advancePaid}</span>,
    },
    {
      key: 'collected',
      header: t('collected'),
      align: 'end',
      cell: (row) => <span className={`${NUM} text-ink`}>{money(row.collectedPaise)}</span>,
    },
  ];
  return (
    <Card>
      <CardHeader title={t('byCampaign')} description={t('byCampaignBody')} />
      <ResponsiveTable
        caption={t('byCampaign')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}
