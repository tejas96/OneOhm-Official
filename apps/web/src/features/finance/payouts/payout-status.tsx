'use client';

import type { IncentiveStatusValue } from '@oneohm/api-contracts';
import { Button, type PillTone, StatusPill, Tooltip } from '@oneohm/design-system/web';
import { Check, Wallet, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import type { PayoutParty, PayoutTarget } from './use-payouts';

const TONE: Readonly<Record<IncentiveStatusValue, PillTone>> = {
  pending: 'review',
  approved: 'onTrack',
  paid: 'done',
  rejected: 'neutral',
};

export interface PayoutRow {
  readonly status: IncentiveStatusValue;
  readonly paidOn: string | null;
  readonly paidMethod: string | null;
  readonly paidReference: string | null;
  readonly rejectReason: string | null;
  readonly approvedBy: { readonly fullName: string } | null;
  /** Commission only: false until the reseller's payout details are complete. */
  readonly payoutReady?: boolean;
}

/** What the tables can do with a row; the tab owns the dialogs and the approve call. */
export interface PayoutActions {
  readonly approvingId: string | null;
  readonly onApprove: (target: PayoutTarget) => void;
  readonly onReject: (target: PayoutTarget) => void;
  readonly onPay: (target: PayoutTarget) => void;
  readonly onPayoutDetails: (party: PayoutParty) => void;
}

/** Status, how it was paid or why it was turned down, and the next action for finance. */
export function PayoutStatus({
  row,
  target,
  actions,
  party,
}: {
  readonly row: PayoutRow;
  readonly target: PayoutTarget;
  readonly actions: PayoutActions;
  /** The reseller, so a blocked payment can open their payout details. */
  readonly party?: PayoutParty;
}) {
  const { onApprove, onReject, onPay, onPayoutDetails } = actions;
  const approving = actions.approvingId === target.id;
  const t = useTranslations('finance.payouts');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const canApprove = useCan('finance.approve_payments');
  const canPay = useCan('finance.record_payments');
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { day: 'numeric', month: 'short' });
  const detail =
    row.status === 'paid' && row.paidOn
      ? [
          t('paidOn', { date: date(row.paidOn) }),
          row.paidMethod && methodT(row.paidMethod),
          row.paidReference,
        ]
          .filter(Boolean)
          .join(' · ')
      : row.status === 'rejected'
        ? row.rejectReason
        : row.status === 'approved' && row.approvedBy
          ? t('approvedBy', { name: row.approvedBy.fullName })
          : null;
  return (
    <span className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill size="sm" tone={TONE[row.status]} label={t(`status.${row.status}`)} />
        {row.status === 'pending' && canApprove && (
          <>
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Check />}
              pending={approving}
              onClick={() => onApprove(target)}
            >
              {t('approve')}
            </Button>
            <Button size="sm" variant="quiet" leadingIcon={<X />} onClick={() => onReject(target)}>
              {t('reject')}
            </Button>
          </>
        )}
        {row.status === 'approved' && canPay && row.payoutReady !== false && (
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Wallet />}
            onClick={() => onPay(target)}
          >
            {t('pay')}
          </Button>
        )}
        {row.status === 'approved' && canPay && row.payoutReady === false && (
          <>
            <Tooltip content={t('payoutMissing')}>
              {/* aria-disabled, not disabled: it keeps hover and focus, so the reason shows. */}
              <Button
                size="sm"
                variant="primary"
                leadingIcon={<Wallet />}
                aria-disabled
                className="aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed aria-disabled:active:scale-100"
              >
                {t('pay')}
              </Button>
            </Tooltip>
            {party && (
              <Button size="sm" variant="secondary" onClick={() => onPayoutDetails(party)}>
                {t('addDetails')}
              </Button>
            )}
          </>
        )}
      </span>
      {detail && <span className="type-body-sm text-ink-faint">{detail}</span>}
    </span>
  );
}
