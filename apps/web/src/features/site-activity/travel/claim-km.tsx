'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSiteFormat } from '../site-format';

const KNOWN = new Set([
  'route_gap',
  'fake_gps',
  'cap_applied',
  'far_check_in',
  'visit_no_location',
  'auto_closed',
  'delayed_tap',
  'over_km',
  'over_amount',
  'no_route',
  'no_visits',
  'uncapped_route',
  'short_route',
  'far_from_base',
  'start_unknown_place',
  'end_unknown_place',
  'start_unknown',
  'end_unknown',
  'start_outside_office',
  'end_outside_office',
  'on_leave',
  'auto_approve_off',
]);

/** How the km were worked out: paid km first, then the route and straight line behind it. */
export function KmLine({ claim }: { readonly claim: TravelClaim }) {
  const t = useTranslations('siteActivity.sheet');
  const format = useSiteFormat();
  return (
    <div className="flex flex-col gap-0.5">
      <p className="type-body-sm text-ink-muted tabular-nums">
        {claim.method === 'route'
          ? t(claim.commuteDeductM > 0 ? 'paidRouteCommute' : 'paidRoute', {
              paid: format.distance(claim.paidM),
              route: format.distance(claim.routeM),
              straight: format.distance(claim.straightM),
              commute: format.distance(claim.commuteDeductM),
            })
          : t(claim.commuteDeductM > 0 ? 'paidStraightCommute' : 'paidStraight', {
              paid: format.distance(claim.paidM),
              commute: format.distance(claim.commuteDeductM),
            })}
      </p>
      {claim.capApplied && (
        <p className="type-body-sm text-ink-faint">
          {t('capNote', { paid: format.distance(claim.paidM) })}
        </p>
      )}
      {claim.gapCount > 0 && (
        <p className="type-body-sm text-ink-faint">
          {t('gapNote', { count: claim.gapCount, minutes: claim.gapMinutes })}
        </p>
      )}
      {claim.autoMade && <p className="type-body-sm text-ink-faint">{t('autoMade')}</p>}
    </div>
  );
}

/** What a manager should look at on an automatic claim that was not approved by itself. */
export function WhyNeedsYou({ claim }: { readonly claim: TravelClaim }) {
  const t = useTranslations('siteActivity');
  if (claim.status !== 'pending' || claim.reviewReasons.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-review-tint px-4 py-3">
      <p className="flex items-center gap-2 type-body-sm font-medium text-review">
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-review" />
        {t('sheet.whyTitle')}
      </p>
      <ul className="flex flex-col gap-1 pl-6 type-body-sm text-ink-muted [list-style:disc]">
        {claim.reviewReasons.map((code) => (
          <li key={code}>{t(`review.${KNOWN.has(code) ? code : 'other'}`)}</li>
        ))}
      </ul>
    </div>
  );
}

/** "Approved automatically", when the system, not a person, approved the claim. */
export function AutoBadge({
  claim,
  short,
}: {
  readonly claim: TravelClaim;
  readonly short?: boolean;
}) {
  const t = useTranslations('siteActivity.claims');
  if (!claim.autoMade) return null;
  if (claim.autoApproved)
    return <StatusPill tone="done" size="sm" label={short ? t('auto') : t('autoApproved')} />;
  return short ? <StatusPill tone="neutral" size="sm" label={t('auto')} /> : null;
}
