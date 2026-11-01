'use client';

import type { CollectionsReport } from '@oneohm/api-contracts';
import { Card, CardHeader, KpiTile, StackedBars } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { PeriodNumbers } from '../parts/period-numbers';
import { ReportBody, ReportNote } from '../parts/report-body';
import { formatRate, money, useBucketNames } from '../parts/report-format';
import { useCollectionsReport } from '../use-business-reports';
import { OwedByProject } from './collections-projects';
import { AgeingTable, CollectedByMethod } from './collections-tables';

const RECEIVABLES = '/finance?tab=receivables';

function Kpis({ data }: { readonly data: CollectionsReport }) {
  const t = useTranslations('collectionsReport.kpis');
  const { totals } = data;
  const split = {
    customer: money(totals.collectedCustomerPaise),
    bank: money(totals.collectedBankPaise),
  };
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('collected')}
        value={totals.collectedPaise}
        format={money}
        detail={
          totals.returnedPaise > 0
            ? t('collectedReturned', { ...split, returned: money(totals.returnedPaise) })
            : t('collectedDetail', split)
        }
        href={RECEIVABLES}
        hrefLabel={t('collectedLink')}
      />
      <KpiTile
        label={t('owed')}
        value={totals.owedCustomerPaise + totals.owedBankPaise}
        format={money}
        detail={t('owedDetail', {
          customer: money(totals.owedCustomerPaise),
          bank: money(totals.owedBankPaise),
          later: money(totals.notDueYetPaise),
        })}
        href={RECEIVABLES}
        hrefLabel={t('owedLink')}
      />
      <KpiTile
        label={t('overdue')}
        value={totals.overduePaise}
        format={money}
        detail={
          totals.oldestOverdueDays === null
            ? t('overdueNone')
            : t('overdueDetail', { count: totals.overdueCount, days: totals.oldestOverdueDays })
        }
        href={RECEIVABLES}
        hrefLabel={t('overdueLink')}
      />
      <KpiTile
        label={t('rate')}
        value={totals.collectionRate ?? 0}
        format={() => formatRate(totals.collectionRate)}
        detail={
          totals.collectionRate === null
            ? t('rateNone')
            : t('rateDetail', {
                paid: money(totals.fellDuePaidPaise),
                due: money(totals.fellDuePaise),
              })
        }
      />
    </div>
  );
}

function Trend({ data }: { readonly data: CollectionsReport }) {
  const t = useTranslations('collectionsReport.trend');
  const names = useBucketNames(data.meta.granularity);
  const unit = t(`unit.${data.meta.granularity}`);
  return (
    <Card>
      <CardHeader title={t('title', { unit })} description={t('body', { unit })} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <StackedBars
          label={t('chartLabel', { unit })}
          series={[
            { key: 'customer', label: t('customer'), fill: 'bg-on-track-solid' },
            { key: 'bank', label: t('bank'), fill: 'bg-party-bank' },
          ]}
          format={money}
          data={data.byBucket.map((bucket, index) => ({
            key: bucket.start,
            label: names.name(bucket),
            tick: index % Math.ceil(data.byBucket.length / 6) === 0 ? names.tick(bucket) : '',
            values: { customer: bucket.customerPaise, bank: bucket.bankPaise },
          }))}
        />
        <PeriodNumbers
          caption={t('chartLabel', { unit })}
          granularity={data.meta.granularity}
          rows={data.byBucket}
          columns={[
            { header: t('customer'), cell: (row) => money(row.customerPaise) },
            { header: t('bank'), cell: (row) => money(row.bankPaise) },
            { header: t('total'), cell: (row) => money(row.customerPaise + row.bankPaise) },
          ]}
        />
      </div>
    </Card>
  );
}

/** Collections: money in, money still owed and how old it is (PRD 3.1, 3.11). */
export function CollectionsReportView() {
  const t = useTranslations('collectionsReport');
  const report = useCollectionsReport();
  return (
    <ReportBody
      query={report}
      label={t('loading')}
      isEmpty={(data) =>
        data.totals.receivedPaise + data.totals.returnedPaise === 0 && data.byProject.length === 0
      }
      empty={{ title: t('empty.title'), description: t('empty.body') }}
    >
      {(data) => (
        <>
          <Kpis data={data} />
          <Trend data={data} />
          <OwedByProject rows={data.byProject} />
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <AgeingTable rows={data.ageing} />
            <CollectedByMethod rows={data.byMethod} />
          </div>
          <ReportNote>{t('note')}</ReportNote>
        </>
      )}
    </ReportBody>
  );
}
