'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { MapPin, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSiteFormat } from './site-format';
import { useProjectSiteVisits } from './use-site-visits';

/** On a task card: the latest site visit for it, and a flag when the check-in was far. */
export function TaskVisitLine({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('siteActivity.visits');
  const format = useSiteFormat();
  const query = useProjectSiteVisits(task.projectId);
  const visit = query.data?.find((item) => item.taskId === task.id);
  if (!visit) return null;
  const when = visit.checkOutAt
    ? t('taskLine', {
        from: format.time(visit.checkInAt),
        to: format.time(visit.checkOutAt),
        duration: format.duration(visit.durationMinutes ?? 0),
      })
    : t('taskLineOpen', { from: format.time(visit.checkInAt) });
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 type-body-sm text-ink-faint">
      <span className="inline-flex items-center gap-1.5">
        <MapPin aria-hidden className="size-3.5" />
        {`${format.day(visit.workDate)} · ${when}`}
      </span>
      {visit.farFromSite && visit.checkInDistanceM !== null && (
        <span className="inline-flex items-center gap-1.5 text-at-risk">
          <TriangleAlert aria-hidden className="size-3.5" />
          {t('taskLineFar', { distance: format.distance(visit.checkInDistanceM) })}
        </span>
      )}
    </p>
  );
}
