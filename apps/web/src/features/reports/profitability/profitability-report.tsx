'use client';

import type { ProfitabilityReport } from '@oneohm/api-contracts';
import { Card, CardHeader, KpiTile, StackedBars } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { PeriodNumbers } from '../parts/period-numbers';
import { ReportBody, ReportNote } from '../parts/report-body';
import { formatRate, money, useBucketNames, whole } from '../parts/report-format';
import { useProfitabilityReport } from '../use-business-reports';
import { CostSplit, MarginByProject } from './profitability-tables';

function Kpis({ data }: { readonly data: ProfitabilityReport }) {
  const t = useTranslations('profitabilityReport.kpis');
  const { totals } = data;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('contract')}
        value={totals.contractPaise}
        format={money}
        detail={t('contractDetail', { count: totals.projects, completed: totals.completed })}
        href="/projects"
        hrefLabel={t('contractLink')}
      />
      <KpiTile
        label={t('margin')}
        value={totals.estimatedMarginRate ?? 0}
        format={() => formatRate(totals.estimatedMarginRate)}
        detail={t('marginDetail', {
          margin: money(totals.contractPaise - totals.estimatedCostPaise),
        })}
      />
      <KpiTile
        label={t('cost')}
        value={totals.actualCostPaise}
        format={money}
        detail={t('costDetail', {
          used: formatRate(totals.costUsedRate),
          estimate: money(totals.estimatedCostPaise),
        })}
      />
      <KpiTile
        label={t('over')}
        value={totals.overBudget}
        format={whole}
        detail={
          totals.overBudget === 0 ? t('overNone') : t('overDetail', { count: totals.overBudget })
        }
      />
    </div>
  );
}

function Trend({ data }: { readonly data: ProfitabilityReport }) {
  const t = useTranslations('profitabilityReport.trend');
  const names = useBucketNames(data.meta.granularity);
  const unit = t(`unit.${data.meta.granularity}`);
  const rate = (row: ProfitabilityReport['byBucket'][number]) =>
    formatRate(
      row.contractPaise ? (row.contractPaise - row.estimatedCostPaise) / row.contractPaise : null,
    );
  return (
    <Card>
      <CardHeader title={t('title', { unit })} description={t('body', { unit })} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <StackedBars
          label={t('chartLabel', { unit })}
          series={[
            { key: 'cost', label: t('cost'), fill: 'bg-done-solid' },
            { key: 'margin', label: t('margin'), fill: 'bg-on-track-solid' },
          ]}
          format={money}
          data={data.byBucket.map((bucket, index) => ({
            key: bucket.start,
            label: names.name(bucket),
            tick: index % Math.ceil(data.byBucket.length / 6) === 0 ? names.tick(bucket) : '',
            values: {
              cost: bucket.estimatedCostPaise,
              margin: bucket.contractPaise - bucket.estimatedCostPaise,
            },
          }))}
        />
        <PeriodNumbers
          caption={t('chartLabel', { unit })}
          granularity={data.meta.granularity}
          rows={data.byBucket}
          columns={[
            { header: t('projects'), cell: (row) => row.projects },
            { header: t('contract'), cell: (row) => money(row.contractPaise) },
            { header: t('marginRate'), cell: rate },
            { header: t('actual'), cell: (row) => money(row.actualCostPaise) },
          ]}
        />
      </div>
    </Card>
  );
}

/** Profitability: are projects making the margin that was quoted (PRD 3.9, Flow F)? */
export function ProfitabilityReportView() {
  const t = useTranslations('profitabilityReport');
  const report = useProfitabilityReport();
  return (
    <ReportBody
      query={report}
      label={t('loading')}
      isEmpty={(data) => data.totals.projects === 0}
      empty={{ title: t('empty.title'), description: t('empty.body') }}
    >
      {(data) => (
        <>
          <Kpis data={data} />
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Trend data={data} />
            <CostSplit cost={data.cost} />
          </div>
          <MarginByProject rows={data.byProject} />
          <ReportNote>{t('note')}</ReportNote>
        </>
      )}
    </ReportBody>
  );
}
