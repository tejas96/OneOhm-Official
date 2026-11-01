'use client';

import type { IncentiveFilter } from '@oneohm/api-contracts';
import { EmptyState, SegmentedControl, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useMutation } from '@tanstack/react-query';
import { Gift, Handshake } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { describeError } from '@/lib/api/api-error';
import { useInvalidateFinance } from '../use-finance';
import { CommissionsTable } from './commissions-table';
import { PayPayoutDialog } from './pay-payout-dialog';
import type { PayoutActions } from './payout-status';
import { RejectPayoutDialog } from './reject-payout-dialog';
import { RewardsTable } from './rewards-table';
import {
  approvePayout,
  type PayoutKind,
  type PayoutTarget,
  useCommissionEntries,
  useReferralRewards,
} from './use-payouts';

const VIEWS = ['commissions', 'referrals'] as const satisfies readonly PayoutKind[];
const FILTERS = ['open', 'pending', 'approved', 'paid', 'rejected', 'all'] as const;

/**
 * Reseller commission and customer referral rewards (PRD 4.8, 5.6): approve to book the
 * expense, then pay. The open view lives in `?view=`.
 */
export function PayoutsTab() {
  const t = useTranslations('finance.payouts');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const view: PayoutKind = params.get('view') === 'referrals' ? 'referrals' : 'commissions';
  const [filter, setFilter] = useState<IncentiveFilter>('open');
  const [paying, setPaying] = useState<PayoutTarget | null>(null);
  const [rejecting, setRejecting] = useState<PayoutTarget | null>(null);
  const commissions = useCommissionEntries(filter, view === 'commissions');
  const rewards = useReferralRewards(filter, view === 'referrals');
  const query = view === 'commissions' ? commissions : rewards;
  const rows = query.data ?? [];

  const approve = useMutation({
    mutationFn: approvePayout,
    onSuccess: async (_result, target) => {
      await invalidate();
      toast({ title: t('approved'), description: target.party, tone: 'success' });
    },
    onError: (error) =>
      toast({ title: t('failed'), description: describeError(error), tone: 'error' }),
  });
  const actions: PayoutActions = {
    approvingId: approve.isPending ? (approve.variables?.id ?? null) : null,
    onApprove: (target) => approve.mutate(target),
    onReject: setRejecting,
    onPay: setPaying,
  };

  const selectView = (next: PayoutKind) => {
    const search = new URLSearchParams(params);
    search.set('view', next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };
  const sum = (status: string) =>
    rows.filter((row) => row.status === status).reduce((total, row) => total + row.amountPaise, 0);

  return (
    <section className="flex flex-col gap-5">
      <p className="max-w-2xl type-body text-ink-muted">{t(`intro.${view}`)}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={view}
          onValueChange={selectView}
          label={t('viewLabel')}
          options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
        />
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            value={filter}
            onValueChange={setFilter}
            label={t('filterLabel')}
            size="sm"
            className="whitespace-nowrap"
            options={FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
          />
        </div>
      </div>
      {query.data && rows.length > 0 && (filter === 'open' || filter === 'all') && (
        <p className="type-body-sm text-ink-faint">
          {t('summary', {
            pending: formatInr(sum('pending')),
            approved: formatInr(sum('approved')),
          })}
        </p>
      )}
      <PayoutsBody view={view} commissions={commissions} rewards={rewards} actions={actions} />
      <PayPayoutDialog target={paying} onClose={() => setPaying(null)} />
      <RejectPayoutDialog target={rejecting} onClose={() => setRejecting(null)} />
    </section>
  );
}

/** Loading, error, empty, or the table for the open view. */
function PayoutsBody({
  view,
  commissions,
  rewards,
  actions,
}: {
  readonly view: PayoutKind;
  readonly commissions: ReturnType<typeof useCommissionEntries>;
  readonly rewards: ReturnType<typeof useReferralRewards>;
  readonly actions: PayoutActions;
}) {
  const t = useTranslations('finance.payouts');
  const query = view === 'commissions' ? commissions : rewards;
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={view === 'commissions' ? <Handshake /> : <Gift />}
        title={t(`empty.${view}.title`)}
        description={t(`empty.${view}.body`)}
      />
    );
  }
  return view === 'commissions' ? (
    <CommissionsTable rows={commissions.data ?? []} actions={actions} />
  ) : (
    <RewardsTable rows={rewards.data ?? []} actions={actions} />
  );
}
