'use client';

import type { ServiceVisitReport, SiteVisit } from '@oneohm/api-contracts';
import { Avatar, Badge, StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { DocumentThumb } from '@/features/documents/document-thumb';
import { useSiteFormat } from '@/features/site-activity/site-format';
import { VisitDistance } from '@/features/site-activity/visit-distance';
import { swatchFor } from '@/lib/format/contact';
import { useAgo } from './use-ago';
import { useFieldWork } from './use-field-work';

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="type-label font-medium text-ink-muted">{title}</p>
      {children}
    </div>
  );
}

function VisitRow({ visit }: { readonly visit: SiteVisit }) {
  const t = useTranslations('service.fieldWork');
  const format = useSiteFormat();
  const when = visit.checkOutAt
    ? t('visitLine', {
        day: format.day(visit.workDate),
        from: format.time(visit.checkInAt),
        to: format.time(visit.checkOutAt),
      })
    : t('visitOpen', { day: format.day(visit.workDate), from: format.time(visit.checkInAt) });
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar name={visit.user.fullName} swatch={swatchFor(visit.user.id)} size="sm" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate type-body-sm font-medium text-ink">{visit.user.fullName}</span>
          <span className="type-label text-ink-faint tabular-nums">{when}</span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 pl-[2.375rem] sm:pl-0">
        {visit.durationMinutes === null ? (
          <Badge variant="soft">{t('onSite')}</Badge>
        ) : (
          <span className="type-body-sm text-ink tabular-nums">
            {format.duration(visit.durationMinutes)}
          </span>
        )}
        <VisitDistance visit={visit} />
      </span>
    </li>
  );
}

function ReportCard({ report }: { readonly report: ServiceVisitReport }) {
  const t = useTranslations('service.fieldWork');
  const ago = useAgo();
  const lines = [
    { key: 'reason', label: t('reason'), text: report.reason },
    { key: 'found', label: t('found'), text: report.found },
    { key: 'workDone', label: t('workDone'), text: report.workDone },
  ].filter((line) => line.text);
  return (
    <li className="flex flex-col gap-3 rounded-lg bg-sunken/60 px-4 py-3">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill
          size="sm"
          tone={report.outcome === 'done' ? 'done' : 'waiting'}
          label={t(`outcome.${report.outcome}`)}
        />
        <span className="type-label text-ink-faint">
          {t('byLine', { name: report.user.fullName, time: ago(report.createdAt) })}
        </span>
      </span>
      <dl className="flex flex-col gap-2.5">
        {lines.map((line) => (
          <div key={line.key} className="flex flex-col gap-0.5">
            <dt className="type-label text-ink-faint">{line.label}</dt>
            <dd className="type-body-sm whitespace-pre-line text-ink">{line.text}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/**
 * The service request as the field saw it (PRD 5.5): each check-in with its time on
 * site and distance flag, what the technician found and did (or why they handed it
 * back), and their photos, videos and voice notes, playable here.
 */
export function TicketFieldWork({ requestId }: { readonly requestId: string }) {
  const t = useTranslations('service.fieldWork');
  const query = useFieldWork(requestId);
  const work = query.data;
  const empty =
    work && work.visits.length === 0 && work.reports.length === 0 && work.files.length === 0;
  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-5">
      <h3 className="type-overline text-ink-faint uppercase">{t('title')}</h3>
      {query.isPending && <ListSkeleton label={t('loading')} rows={2} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {empty && <p className="type-body-sm text-ink-faint">{t('empty')}</p>}
      {work && work.visits.length > 0 && (
        <Group title={t('visits')}>
          <ul className="flex flex-col divide-y divide-hairline rounded-lg ring-1 ring-hairline">
            {work.visits.map((visit) => (
              <VisitRow key={visit.id} visit={visit} />
            ))}
          </ul>
        </Group>
      )}
      {work && work.reports.length > 0 && (
        <Group title={t('reports')}>
          <ul className="flex flex-col gap-2">
            {work.reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </ul>
        </Group>
      )}
      {work && work.files.length > 0 && (
        <Group title={t('files', { count: work.files.length })}>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {work.files.map((file) => (
              <DocumentThumb key={file.id} file={file} />
            ))}
          </ul>
        </Group>
      )}
    </section>
  );
}
