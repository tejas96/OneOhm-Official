'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { Avatar, Button, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { swatchFor } from '@/lib/format/contact';
import { useSiteFormat } from '../site-format';
import { ClaimStatus } from './claim-status';

/** One row per claimed day: who, which day, how far, how much, and where it stands. */
export function ClaimsTable({
  claims,
  onOpen,
}: {
  readonly claims: readonly TravelClaim[];
  readonly onOpen: (claim: TravelClaim) => void;
}) {
  const t = useTranslations('siteActivity.claims');
  const format = useSiteFormat();

  const columns: readonly TableColumn<TravelClaim>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (claim) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={claim.user.fullName} swatch={swatchFor(claim.user.id)} size="sm" />
          <span className="truncate type-body font-medium text-ink">{claim.user.fullName}</span>
        </span>
      ),
    },
    {
      key: 'day',
      header: t('columns.day'),
      cell: (claim) => <span className="type-body-sm text-ink">{format.day(claim.workDate)}</span>,
    },
    {
      key: 'visits',
      header: t('columns.visits'),
      cell: (claim) => (
        <span className="flex flex-col">
          <span className="type-body-sm text-ink-muted">
            {t('visitsCount', { count: claim.visits })}
          </span>
          {claim.project && (
            <span className="type-label text-ink-faint">
              {t('forProject', { code: claim.project.code })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'distance',
      header: t('columns.distance'),
      align: 'end',
      cell: (claim) => (
        <span className="flex flex-col items-end">
          <span className="font-mono text-[0.875rem] text-ink tabular-nums">
            {format.distance(claim.distanceM)}
          </span>
          <span className="type-label text-ink-faint">
            {t('rate', { rate: formatInr(claim.ratePaisePerKm) })}
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (claim) => (
        <span className="font-mono text-[0.875rem] text-ink tabular-nums">
          {formatInr(claim.amountPaise)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (claim) => (
        <span className="flex flex-wrap items-center justify-end gap-2 md:justify-between">
          <ClaimStatus claim={claim} />
          <Button
            size="sm"
            variant={claim.status === 'pending' ? 'secondary' : 'quiet'}
            onClick={() => onOpen(claim)}
          >
            {claim.status === 'pending' ? t('review') : t('open')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={claims}
      rowKey={(claim) => claim.id}
    />
  );
}
