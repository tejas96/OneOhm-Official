'use client';

import type { SiteVisit } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { MapPin, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSiteFormat } from './site-format';

/** How far from the saved site a check-in was, flagged when far; or why it is unknown. */
export function VisitDistance({ visit }: { readonly visit: SiteVisit }) {
  const t = useTranslations('siteActivity.distance');
  const format = useSiteFormat();
  if (visit.checkInDistanceM === null) {
    const why =
      visit.locationNote === 'site_unknown'
        ? t('siteUnknown')
        : visit.locationCleared
          ? t('cleared')
          : t('notShared');
    return (
      <span className="inline-flex items-center gap-1.5 type-body-sm text-ink-faint">
        <MapPinOff aria-hidden className="size-3.5 shrink-0" />
        {why}
      </span>
    );
  }
  const distance = format.distance(visit.checkInDistanceM);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2 md:justify-start">
      <span className="inline-flex items-center gap-1.5 type-body-sm text-ink">
        <MapPin aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
        {t('fromSite', { distance })}
      </span>
      {visit.farFromSite && <StatusPill tone="atRisk" size="sm" label={t('farFlag')} />}
    </span>
  );
}
