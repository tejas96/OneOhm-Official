'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useSiteFormat } from '../site-format';
import { VisitDistance } from '../visit-distance';
import { useClaimDay } from './use-travel';

export function Section({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="type-overline text-ink-faint">{title}</h3>
        {hint && <p className="type-body-sm text-ink-faint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Stable keys for legs, which can repeat (two visits to one site). */
function keyed(legs: TravelClaim['legs']) {
  const seen = new Map<string, number>();
  return legs.map((leg) => {
    const base = `${leg.fromLabel}>${leg.toLabel}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { leg, key: `${base}#${count}`, first: leg === legs[0] };
  });
}

export function Route({ claim }: { readonly claim: TravelClaim }) {
  const t = useTranslations('siteActivity.sheet');
  const format = useSiteFormat();
  return (
    <ol className="flex flex-col gap-1 rounded-lg border border-hairline px-4 py-3">
      {keyed(claim.legs).map(({ leg, key, first }) => (
        <li key={key} className="flex flex-col gap-1">
          {first && <span className="type-body-sm text-ink">{leg.fromLabel}</span>}
          <span className="flex items-center gap-2 pl-1 type-label text-ink-faint">
            <ArrowDown aria-hidden className="size-3.5 shrink-0" />
            {leg.distanceM === null ? t('unpaidLeg') : format.distance(leg.distanceM)}
          </span>
          <span className="type-body-sm text-ink">{leg.toLabel}</span>
        </li>
      ))}
    </ol>
  );
}

export function DayVisits({ claimId }: { readonly claimId: string }) {
  const t = useTranslations('siteActivity');
  const format = useSiteFormat();
  const day = useClaimDay(claimId);
  if (day.isPending) return <ListSkeleton label={t('sheet.loading')} rows={2} />;
  if (day.isError) return <LoadError error={day.error} onRetry={() => day.refetch()} />;
  if (day.data.visits.length === 0)
    return <p className="type-body-sm text-ink-faint">{t('sheet.noVisits')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
      {day.data.visits.map((visit) => (
        <li key={visit.id} className="flex flex-col gap-1.5 px-4 py-3">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="type-body-sm font-medium text-ink">
              {[visit.projectCode, visit.taskTitle].filter(Boolean).join(' · ')}
            </span>
            <span className="font-mono text-[0.8125rem] text-ink-muted tabular-nums">
              {visit.checkOutAt
                ? t('visits.inOut', {
                    from: format.time(visit.checkInAt),
                    to: format.time(visit.checkOutAt),
                  })
                : t('visits.stillIn', { from: format.time(visit.checkInAt) })}
            </span>
          </span>
          <VisitDistance visit={visit} />
        </li>
      ))}
    </ul>
  );
}
