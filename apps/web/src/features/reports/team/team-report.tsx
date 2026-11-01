'use client';

import type { TeamReport } from '@oneohm/api-contracts';
import {
  Card,
  CardHeader,
  KpiTile,
  SegmentedControl,
  StackedBars,
} from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centerHref } from '../../command-center/center-links';
import { useCenterFilters } from '../../command-center/use-center-filters';
import { PeriodNumbers } from '../parts/period-numbers';
import { ReportBody, ReportNote } from '../parts/report-body';
import { formatRate, useBucketNames, whole } from '../parts/report-format';
import { useTeamReport } from '../use-business-reports';
import { AwayList } from './team-away';
import { CrewTable, PeopleTable } from './team-tables';

function Kpis({ data }: { readonly data: TeamReport }) {
  const t = useTranslations('teamReport.kpis');
  const { totals } = data;
  const { query } = useCenterFilters();
  const days = (value: number) => t('days', { days: Math.round(value * 2) / 2 });
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('onTime')}
        value={totals.onTimeRate ?? 0}
        format={() => formatRate(totals.onTimeRate)}
        detail={
          totals.finished === 0
            ? t('onTimeNone')
            : t('onTimeDetail', { onTime: totals.onTime, finished: totals.finished })
        }
      />
      <KpiTile
        label={t('pastDue')}
        value={totals.pastDue}
        format={whole}
        detail={t('pastDueDetail', { open: totals.open, people: totals.peopleBehind })}
        href={centerHref('/command-center/tasks', query, { show: 'overdue' })}
        hrefLabel={t('pastDueLink')}
      />
      <KpiTile
        label={t('leave')}
        value={totals.leaveHalfDays / 2}
        format={days}
        detail={t('leaveDetail', {
          away: totals.awayToday,
          ahead: totals.leaveAheadHalfDays / 2,
        })}
        href="/team?tab=leave"
        hrefLabel={t('leaveLink')}
      />
      <KpiTile
        label={t('present')}
        value={totals.daysPresent}
        format={(value) => t('days', { days: Math.round(value) })}
        detail={t('presentDetail', {
          late: totals.lateCheckIns,
          people: totals.peopleCheckedIn,
        })}
        href="/team?tab=attendance"
        hrefLabel={t('presentLink')}
      />
    </div>
  );
}

type Who = 'staff' | 'crew';

function Trend({ data }: { readonly data: TeamReport }) {
  const t = useTranslations('teamReport.trend');
  const names = useBucketNames(data.meta.granularity);
  const [who, setWho] = useState<Who>('staff');
  const unit = t(`unit.${data.meta.granularity}`);
  const every = Math.ceil(data.byBucket.length / 6);
  const rows = data.byBucket.map((bucket) => ({
    ...bucket,
    onTime: who === 'staff' ? bucket.staffOnTime : bucket.crewOnTime,
    late: who === 'staff' ? bucket.staffLate : bucket.crewLate,
  }));
  const any = rows.some((row) => row.onTime + row.late > 0);
  return (
    <Card>
      <CardHeader
        title={t('title', { unit })}
        description={t(who === 'staff' ? 'staffBody' : 'crewBody', { unit })}
        action={
          <SegmentedControl
            label={t('show')}
            size="sm"
            value={who}
            onValueChange={setWho}
            options={[
              { value: 'staff', label: t('staff') },
              { value: 'crew', label: t('crew') },
            ]}
          />
        }
      />
      {any ? (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <StackedBars
            label={t('chartLabel', { unit })}
            series={[
              { key: 'onTime', label: t('onTime'), fill: 'bg-on-track-solid' },
              { key: 'late', label: t('late'), fill: 'bg-overdue-solid' },
            ]}
            data={rows.map((row, index) => ({
              key: row.start,
              label: names.name(row),
              tick: index % every === 0 ? names.tick(row) : '',
              values: { onTime: row.onTime, late: row.late },
            }))}
          />
          <PeriodNumbers
            caption={t('chartLabel', { unit })}
            granularity={data.meta.granularity}
            rows={rows}
            columns={[
              { header: t('onTime'), cell: (row) => row.onTime },
              { header: t('late'), cell: (row) => row.late },
              {
                header: t('rate'),
                cell: (row) =>
                  formatRate(row.onTime + row.late ? row.onTime / (row.onTime + row.late) : null),
              },
            ]}
          />
        </div>
      ) : (
        <p className="px-5 pb-5 type-body-sm text-ink-muted">{t('none')}</p>
      )}
    </Card>
  );
}

/** Team: who is delivering, who is overloaded, who is away (PRD 3.1). */
export function TeamReportView() {
  const t = useTranslations('teamReport');
  const report = useTeamReport();
  return (
    <ReportBody
      query={report}
      label={t('loading')}
      isEmpty={(data) => data.people.length + data.crews.length + data.away.length === 0}
      empty={{ title: t('empty.title'), description: t('empty.body') }}
    >
      {(data) => (
        <>
          <Kpis data={data} />
          <Trend data={data} />
          <PeopleTable rows={data.people} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <CrewTable rows={data.crews} />
            <AwayList rows={data.away} />
          </div>
          <ReportNote>{t('note')}</ReportNote>
        </>
      )}
    </ReportBody>
  );
}
