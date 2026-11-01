'use client';

import type { DelaysReport } from '@oneohm/api-contracts';
import {
  Card,
  CardHeader,
  KpiTile,
  SegmentedControl,
  StackedBars,
} from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centerHref } from '@/features/command-center/center-links';
import { useCenterFilters } from '@/features/command-center/use-center-filters';
import { PeriodNumbers } from '../parts/period-numbers';
import { ReportBody, ReportNote } from '../parts/report-body';
import { useBucketNames, whole } from '../parts/report-format';
import { useDelaysReport } from '../use-business-reports';
import { PARTIES, PARTY_FILL, PartySwatch } from './delay-party';
import { DiscomTime, SlowestSteps, WaitingNow } from './delays-tables';

/** One tile per cause: days late on tasks finished in the period plus open ones past due. */
function Kpis({ data }: { readonly data: DelaysReport }) {
  const t = useTranslations('delaysReport.kpis');
  const { query } = useCenterFilters();
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {data.byParty.map((row) => (
        <KpiTile
          key={row.party}
          icon={<PartySwatch party={row.party} />}
          label={t(row.party)}
          value={row.finishedDays + row.openDays}
          format={(days) => t('days', { days: Math.round(days) })}
          detail={
            <span className="flex flex-col">
              <span>{t('finished', { count: row.finishedLate, days: row.finishedDays })}</span>
              <span>{t('open', { count: row.openLate, days: row.openDays })}</span>
            </span>
          }
          href={centerHref('/command-center/tasks', query, { show: 'late', party: row.party })}
          hrefLabel={t('openLate', { party: t(row.party) })}
        />
      ))}
    </div>
  );
}

type Show = 'days' | 'tasks';

function Trend({ data }: { readonly data: DelaysReport }) {
  const t = useTranslations('delaysReport.trend');
  const party = useTranslations('delaysReport.party');
  const names = useBucketNames(data.meta.granularity);
  const [show, setShow] = useState<Show>('days');
  const unit = t(`unit.${data.meta.granularity}`);
  const every = Math.ceil(data.byBucket.length / 6);
  const total = (values: DelaysReport['byBucket'][number]['days']) =>
    PARTIES.reduce((sum, key) => sum + values[key], 0);
  const anyLate = data.byBucket.some((bucket) => total(bucket.tasks) > 0);
  return (
    <Card>
      <CardHeader
        title={t(show === 'days' ? 'titleDays' : 'titleTasks', { unit })}
        description={t('body', { unit })}
        action={
          anyLate && (
            <SegmentedControl
              label={t('show')}
              size="sm"
              value={show}
              onValueChange={setShow}
              options={[
                { value: 'days', label: t('days') },
                { value: 'tasks', label: t('tasks') },
              ]}
            />
          )
        }
      />
      {anyLate ? (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <StackedBars
            label={t('chartLabel', { unit })}
            series={PARTIES.map((key) => ({ key, label: party(key), fill: PARTY_FILL[key] }))}
            format={whole}
            data={data.byBucket.map((bucket, index) => ({
              key: bucket.start,
              label: names.name(bucket),
              tick: index % every === 0 ? names.tick(bucket) : '',
              values: bucket[show],
            }))}
          />
          <PeriodNumbers
            caption={t('chartLabel', { unit })}
            granularity={data.meta.granularity}
            rows={data.byBucket}
            columns={[
              ...PARTIES.map((key) => ({
                header: party(key),
                cell: (row: DelaysReport['byBucket'][number]) => row[show][key],
              })),
              { header: t('total'), cell: (row) => total(row[show]) },
            ]}
          />
        </div>
      ) : (
        <p className="px-5 pb-5 type-body-sm text-ink-muted">{t('none')}</p>
      )}
    </Card>
  );
}

/** Delays: where days are lost and on whom, utility time apart (PRD 3.1, 3.8). */
export function DelaysReportView() {
  const t = useTranslations('delaysReport');
  const report = useDelaysReport();
  return (
    <ReportBody
      query={report}
      label={t('loading')}
      isEmpty={(data) => data.totals.finished + data.totals.openLate + data.totals.waitingNow === 0}
      empty={{ title: t('empty.title'), description: t('empty.body') }}
    >
      {(data) => (
        <>
          <Kpis data={data} />
          <p className="type-body-sm text-ink-muted">
            {t('summary', {
              finished: data.totals.finished,
              late: data.totals.finishedLate,
              open: data.totals.openLate,
              waiting: data.totals.waitingNow,
            })}
          </p>
          <Trend data={data} />
          <SlowestSteps rows={data.steps} />
          <DiscomTime rows={data.discoms} />
          <WaitingNow rows={data.waiting} />
          <ReportNote>{t('note')}</ReportNote>
        </>
      )}
    </ReportBody>
  );
}
