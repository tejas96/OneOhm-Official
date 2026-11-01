'use client';

import type { DeliveryReport } from '@oneohm/api-contracts';
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
import { decimal, formatRate, kwp, useBucketNames, whole } from '../parts/report-format';
import { useDeliveryReport } from '../use-business-reports';
import { DeliveryByProject, DeliveryByStage } from './delivery-tables';

function Kpis({ data }: { readonly data: DeliveryReport }) {
  const t = useTranslations('deliveryReport.kpis');
  const { tasks } = data.totals;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('onTime')}
        value={tasks.onTimeRate ?? 0}
        format={() => formatRate(tasks.onTimeRate)}
        detail={t('onTimeDetail', { onTime: tasks.onTime, finished: tasks.onTime + tasks.late })}
      />
      <KpiTile
        label={t('late')}
        value={tasks.late}
        goodDirection="down"
        format={whole}
        detail={
          tasks.averageDaysLate === null
            ? t('lateNone')
            : t('lateDetail', { days: decimal(tasks.averageDaysLate) })
        }
      />
      <KpiTile
        label={t('overdue')}
        value={tasks.openOverdue}
        goodDirection="down"
        format={whole}
        detail={t('overdueDetail', { projects: data.totals.liveProjects })}
        href="/today"
        hrefLabel={t('overdueLink')}
      />
      <KpiTile
        label={t('commissioned')}
        value={data.totals.commissionedWp}
        format={kwp}
        detail={
          data.totals.commissioned === 0
            ? t('commissionedNone')
            : t('commissionedDetail', {
                count: data.totals.commissioned,
                days: decimal(data.totals.averageDaysToCommission),
              })
        }
        href="/projects"
        hrefLabel={t('commissionedLink')}
      />
    </div>
  );
}

function Trend({ data }: { readonly data: DeliveryReport }) {
  const t = useTranslations('deliveryReport.trend');
  const names = useBucketNames(data.meta.granularity);
  const [show, setShow] = useState<'tasks' | 'commissioned'>('tasks');
  const unit = t(`unit.${data.meta.granularity}`);
  const series =
    show === 'tasks'
      ? [
          { key: 'onTime', label: t('onTime'), fill: 'bg-on-track-solid' },
          { key: 'late', label: t('late'), fill: 'bg-overdue-solid' },
        ]
      : [{ key: 'commissionedWp', label: t('commissioned'), fill: 'bg-accent' }];
  return (
    <Card>
      <CardHeader
        title={t('title', { unit })}
        description={t(show === 'tasks' ? 'tasksBody' : 'commissionedBody', { unit })}
        action={
          <SegmentedControl
            label={t('show')}
            size="sm"
            value={show}
            onValueChange={setShow}
            options={[
              { value: 'tasks', label: t('tasks') },
              { value: 'commissioned', label: t('commissioned') },
            ]}
          />
        }
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <StackedBars
          label={t('chartLabel', { unit })}
          series={series}
          format={show === 'tasks' ? whole : kwp}
          data={data.byBucket.map((bucket, index) => ({
            key: bucket.start,
            label: names.name(bucket),
            tick: index % Math.ceil(data.byBucket.length / 6) === 0 ? names.tick(bucket) : '',
            values: {
              onTime: bucket.onTime,
              late: bucket.late,
              commissionedWp: bucket.commissionedWp,
            },
          }))}
        />
        <PeriodNumbers
          caption={t('chartLabel', { unit })}
          granularity={data.meta.granularity}
          rows={data.byBucket}
          columns={[
            { header: t('onTime'), cell: (row) => row.onTime },
            { header: t('late'), cell: (row) => row.late },
            { header: t('commissioned'), cell: (row) => kwp(row.commissionedWp) },
          ]}
        />
      </div>
    </Card>
  );
}

/** Delivery: tasks on time against late, and systems switched on (PRD 3.1, 3.8). */
export function DeliveryReportView() {
  const t = useTranslations('deliveryReport');
  const report = useDeliveryReport();
  return (
    <ReportBody
      query={report}
      label={t('loading')}
      isEmpty={(data) => {
        const { tasks } = data.totals;
        return tasks.onTime + tasks.late + tasks.openOverdue + data.totals.liveProjects === 0;
      }}
      empty={{ title: t('empty.title'), description: t('empty.body') }}
    >
      {(data) => (
        <>
          <Kpis data={data} />
          <Trend data={data} />
          <div className="flex flex-col gap-6">
            <DeliveryByProject rows={data.byProject} />
            <DeliveryByStage rows={data.byStage} />
          </div>
          <ReportNote>{t('note')}</ReportNote>
        </>
      )}
    </ReportBody>
  );
}
