'use client';

import type { PhotoGeotag } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { MapPin, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSiteFormat } from './site-format';

/**
 * In a document's details: "Taken at site, 40 m away, 10:42" (PRD 4.2). Shown inside the
 * details list, so it renders a term and its description.
 */
export function PhotoGeotagDetail({ geotag }: { readonly geotag: PhotoGeotag | null | undefined }) {
  const t = useTranslations('siteActivity.geotag');
  const format = useSiteFormat();
  if (!geotag) return null;
  const far = geotag.farFromSite === true;
  const time = geotag.capturedAt ? format.time(geotag.capturedAt) : '—';
  const distance = geotag.distanceM === null ? null : format.distance(geotag.distanceM);
  const words =
    distance !== null
      ? t(far ? 'farFromSite' : 'atSite', { distance, time })
      : t(geotag.located ? 'noSite' : 'timeOnly', { time });
  const Icon = geotag.located ? MapPin : MapPinOff;
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
      <dt className="type-body-sm text-ink-faint">{t('label')}</dt>
      <dd className="flex min-h-6 min-w-0 flex-col gap-0.5 type-body-sm">
        <span className={cn('inline-flex items-center gap-2', far ? 'text-at-risk' : 'text-ink')}>
          <Icon aria-hidden className="size-4 shrink-0 text-current opacity-70" />
          {words}
        </span>
        <span className="pl-6 type-label text-ink-faint">
          {geotag.source === 'exif' ? t('fromCamera') : t('fromPhone')}
        </span>
      </dd>
    </div>
  );
}
