'use client';

import type { SiteVisit } from '@oneohm/api-contracts';
import { Badge } from '@oneohm/design-system/web';
import { isAutoSource } from '@oneohm/domain';
import { useTranslations } from 'next-intl';

/**
 * A small "Auto" label when the phone's fence or the route made the check-in or check-out, and
 * the reason the person gave in plain words when they left before the job was done.
 */
export function VisitNotes({ visit }: { readonly visit: SiteVisit }) {
  const t = useTranslations('siteActivity.visits');
  const auto = isAutoSource(visit.checkInSource) || isAutoSource(visit.checkOutSource);
  if (!auto && !visit.leaveReason) return null;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2 md:justify-start">
      {auto && <Badge variant="soft">{t('auto')}</Badge>}
      {visit.leaveReason && (
        <span className="type-body-sm text-ink-muted">
          {t('leftBecause', { reason: t(`leaveReasons.${visit.leaveReason}`) })}
        </span>
      )}
    </span>
  );
}
