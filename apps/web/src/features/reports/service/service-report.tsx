'use client';

import type { ServiceReport } from '@oneohm/api-contracts';
import { Card, CardHeader, KpiTile, StackedBars } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { PeriodNumbers } from '../parts/period-numbers';
import { ReportBody, ReportNote } from '../parts/report-body';
import { decimal, formatRate, useBucketNames, whole } from '../parts/report-format';
import { useServiceReport } from '../use-business-reports';
import { ServiceByAssignee, ServiceByCategory } from './service-tables';

function Kpis({ data }: { readonly data: ServiceReport }) {
  const t = useTranslations('serviceReport.kpis');
  const { totals } = data;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('raised')}
        value={totals.raised}
        format={whole}
        goodDirection="none"
        detail={t('raisedDetail', { resolved: totals.resolved })}
        href="/service"
        hrefLabel={t('serviceLink')}
      />
      <KpiTile
        label={t('open')}
        value={totals.openNow}
        format={whole}
        goodDirection="down"
        detail={t('openDetail')}
        href="/service"
        hrefLabel={t('serviceLink')}
      />
      <KpiTile
        label={t('speed')}
        value={totals.averageResolutionHours ?? 0}
        format={() => decimal(totals.averageResolutionHours)}
        goodDirection="down"
        detail={t('speedDetail', { rate: formatRate(totals.withinTwoDaysRate) })}
      />
      <KpiTile
        label={t('rating')}
        value={totals.averageRating ?? 0}
        format={() =>
          totals.averageRating === null ? '–' : `${decimal(totals.averageRating)} / 5`
        }
        detail={t('ratingDetail', { count: totals.ratings })}
      />
    </div>
  );
}

function Trend({ data }: { readonly data: ServiceReport }) {
  const t = useTranslations('serviceReport.trend');
  const names = useBucketNames(data.meta.granularity);
  const unit = t(`unit.${data.meta.granularity}`);
  return (
    <Card>
      <CardHeader title={t('title', { unit })} description={t('body', { unit })} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <StackedBars
          label={t('chartLabel', { unit })}
          series={[
            { key: 'resolved', label: t('resolved'), fill: 'bg-on-track-solid' },
            { key: 'open', label: t('stillOpen', { unit }), fill: 'bg-at-risk-solid' },
          ]}
          data={data.byBucket.map((bucket, index) => ({
            key: bucket.start,
            label: names.name(bucket),
            tick: index % Math.ceil(data.byBucket.length / 6) === 0 ? names.tick(bucket) : '',
            values: {
              resolved: Math.min(bucket.resolved, bucket.raised),
              open: Math.max(0, bucket.raised - bucket.resolved),
            },
          }))}
        />
        <PeriodNumbers
          caption={t('chartLabel', { unit })}
          granularity={data.meta.granularity}
          rows={data.byBucket}
          columns={[
            { header: t('raised'), cell: (row) => row.raised },
            { header: t('resolved'), cell: (row) => row.resolved },
          ]}
        />
      </div>
    </Card>
  );
}

/** Service: requests raised and resolved, how fast, and what customers think (PRD 3.16). */
export function ServiceReportView() {
  const t = useTranslations('serviceReport');
  const report = useServiceReport();
  return (
    <ReportBody
      query={report}
      label={t('loading')}
      isEmpty={(data) =>
        data.totals.raised + data.totals.resolved + data.totals.openNow + data.totals.ratings === 0
      }
      empty={{ title: t('empty.title'), description: t('empty.body') }}
    >
      {(data) => (
        <>
          <Kpis data={data} />
          <Trend data={data} />
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <ServiceByCategory rows={data.byCategory} />
            <ServiceByAssignee rows={data.byAssignee} />
          </div>
          <ReportNote>{t('note')}</ReportNote>
        </>
      )}
    </ReportBody>
  );
}
