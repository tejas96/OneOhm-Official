'use client';

import type { SiteVisit } from '@oneohm/api-contracts';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  ResponsiveTable,
  type TableColumn,
} from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { swatchFor } from '@/lib/format/contact';
import { useSiteFormat } from './site-format';
import { useProjectSiteVisits } from './use-site-visits';
import { VisitDistance } from './visit-distance';

/** Check-ins at the project's site: who, for which task, in and out, and how far (PRD 4.2). */
export function SiteVisitsCard({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('siteActivity');
  const format = useSiteFormat();
  const query = useProjectSiteVisits(projectId);
  const visits = query.data ?? [];
  const far = visits.filter((visit) => visit.farFromSite).length;

  const columns: readonly TableColumn<SiteVisit>[] = [
    {
      key: 'person',
      header: t('visits.columns.person'),
      primary: true,
      cell: (visit) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={visit.user.fullName} swatch={swatchFor(visit.user.id)} size="sm" />
          <span className="truncate type-body font-medium text-ink">{visit.user.fullName}</span>
        </span>
      ),
    },
    {
      key: 'task',
      header: t('visits.columns.task'),
      cell: (visit) => (
        <span className="flex min-w-0 flex-col items-end md:items-start">
          <span className="truncate type-body-sm text-ink">{visit.taskTitle ?? '—'}</span>
          <span className="type-label text-ink-faint">{t(`kinds.${visit.kind}`)}</span>
        </span>
      ),
    },
    {
      key: 'inOut',
      header: t('visits.columns.inOut'),
      cell: (visit) => (
        <span className="flex flex-col items-end md:items-start">
          <span className="font-mono text-[0.8125rem] text-ink tabular-nums">
            {visit.checkOutAt
              ? t('visits.inOut', {
                  from: format.time(visit.checkInAt),
                  to: format.time(visit.checkOutAt),
                })
              : t('visits.stillIn', { from: format.time(visit.checkInAt) })}
          </span>
          <span className="type-label text-ink-faint">{format.day(visit.workDate)}</span>
        </span>
      ),
    },
    {
      key: 'duration',
      header: t('visits.columns.duration'),
      cell: (visit) =>
        visit.durationMinutes === null ? (
          <Badge variant="soft">{t('duration.onSite')}</Badge>
        ) : (
          <span className="type-body-sm text-ink tabular-nums">
            {format.duration(visit.durationMinutes)}
          </span>
        ),
    },
    {
      key: 'where',
      header: t('visits.columns.where'),
      cell: (visit) => <VisitDistance visit={visit} />,
    },
  ];

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={t('visits.title')}
        description={t('visits.description')}
        action={
          far > 0 ? (
            <span className="type-body-sm text-at-risk">
              {t('visits.farCount', { count: far })}
            </span>
          ) : undefined
        }
      />
      <div className="border-t border-hairline">
        {query.isPending && (
          <div className="px-5 py-4">
            <ListSkeleton label={t('visits.loading')} rows={2} />
          </div>
        )}
        {query.isError && (
          <div className="px-5 py-4">
            <LoadError error={query.error} onRetry={() => query.refetch()} />
          </div>
        )}
        {query.data && visits.length === 0 && (
          <p className="px-5 py-5 type-body-sm text-ink-muted">{t('visits.empty')}</p>
        )}
        {visits.length > 0 && (
          <ResponsiveTable
            caption={t('visits.caption')}
            columns={columns}
            rows={visits}
            rowKey={(visit) => visit.id}
          />
        )}
      </div>
    </Card>
  );
}
