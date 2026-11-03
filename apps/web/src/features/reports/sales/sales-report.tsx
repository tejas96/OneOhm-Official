'use client';

import type { SalesReport } from '@oneohm/api-contracts';
import {
  Card,
  CardHeader,
  KpiTile,
  SegmentedControl,
  StackedBars,
} from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PeriodNumbers } from '../parts/period-numbers';
import { ReportBody, ReportNote } from '../parts/report-body';
import { decimal, formatRate, kwp, money, useBucketNames, whole } from '../parts/report-format';
import { useSalesReport } from '../use-business-reports';
import {
  LostReasons,
  SalesByCampaign,
  SalesByOwner,
  SalesBySource,
  SalesFunnel,
} from './sales-tables';

function Kpis({ data }: { readonly data: SalesReport }) {
  const t = useTranslations('salesReport.kpis');
  const { totals } = data;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('leads')}
        value={totals.leads}
        format={whole}
        detail={t('leadsDetail', { quoted: data.funnel.quoted, lost: totals.lost })}
        href="/leads"
        hrefLabel={t('leadsLink')}
      />
      <KpiTile
        label={t('won')}
        value={totals.wonPaise}
        format={money}
        detail={t('wonDetail', { count: totals.won, capacity: kwp(totals.wonWp) })}
        href="/quotations?filter=accepted"
        hrefLabel={t('wonLink')}
      />
      <KpiTile
        label={t('conversion')}
        value={totals.leadToWonRate ?? 0}
        format={() => formatRate(totals.leadToWonRate)}
        detail={t('conversionDetail', { won: data.funnel.won, leads: totals.leads })}
      />
      <KpiTile
        label={t('winRate')}
        value={totals.quoteWinRate ?? 0}
        format={() => formatRate(totals.quoteWinRate)}
        detail={
          totals.averageOrderPaise === null
            ? t('winRateNone')
            : t('winRateDetail', {
                average: money(totals.averageOrderPaise),
                days: decimal(totals.averageDaysToWin),
              })
        }
      />
    </div>
  );
}

function Trend({ data }: { readonly data: SalesReport }) {
  const t = useTranslations('salesReport.trend');
  const names = useBucketNames(data.meta.granularity);
  const [show, setShow] = useState<'leads' | 'won'>('leads');
  const unit = t(`unit.${data.meta.granularity}`);
  const series =
    show === 'leads'
      ? [{ key: 'leads', label: t('leads'), fill: 'bg-accent' }]
      : [{ key: 'won', label: t('won'), fill: 'bg-on-track-solid' }];
  return (
    <Card>
      <CardHeader
        title={t('title', { unit })}
        description={t(show === 'leads' ? 'leadsBody' : 'wonBody', { unit })}
        action={
          <SegmentedControl
            label={t('show')}
            size="sm"
            value={show}
            onValueChange={setShow}
            options={[
              { value: 'leads', label: t('leads') },
              { value: 'won', label: t('won') },
            ]}
          />
        }
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <StackedBars
          label={t('chartLabel', { unit })}
          series={series}
          format={show === 'won' ? money : whole}
          data={data.byBucket.map((bucket, index) => ({
            key: bucket.start,
            label: names.name(bucket),
            tick: index % Math.ceil(data.byBucket.length / 6) === 0 ? names.tick(bucket) : '',
            values: { leads: bucket.leads, won: bucket.wonPaise },
          }))}
        />
        <PeriodNumbers
          caption={t('chartLabel', { unit })}
          granularity={data.meta.granularity}
          rows={data.byBucket}
          columns={[
            { header: t('leads'), cell: (row) => row.leads },
            { header: t('orders'), cell: (row) => row.won },
            { header: t('won'), cell: (row) => money(row.wonPaise) },
          ]}
        />
      </div>
    </Card>
  );
}

/** Sales: leads in, quotations out, orders won, and where they came from (PRD 3.1, 3.3). */
export function SalesReportView() {
  const t = useTranslations('salesReport');
  const report = useSalesReport();
  return (
    <ReportBody
      query={report}
      label={t('loading')}
      isEmpty={(data) => data.totals.leads + data.totals.quotesSent + data.totals.won === 0}
      empty={{ title: t('empty.title'), description: t('empty.body') }}
    >
      {(data) => (
        <>
          <Kpis data={data} />
          <Trend data={data} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <SalesByOwner rows={data.byOwner} />
              <SalesBySource rows={data.bySource} />
              <SalesByCampaign rows={data.byCampaign} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <SalesFunnel funnel={data.funnel} />
              <LostReasons rows={data.lostReasons} />
            </div>
          </div>
          <ReportNote>{t('note')}</ReportNote>
        </>
      )}
    </ReportBody>
  );
}
