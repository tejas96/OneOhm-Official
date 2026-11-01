'use client';

import type { IncentiveStatusValue } from '@oneohm/api-contracts';
import { Button, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { Check, Wallet, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import type { PayoutTarget } from './use-payouts';

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
}

/** What the tables can do with a row; the tab owns the dialogs and the approve call. */
export interface PayoutActions {
  readonly approvingId: string | null;
  readonly onApprove: (target: PayoutTarget) => void;
  readonly onReject: (target: PayoutTarget) => void;
  readonly onPay: (target: PayoutTarget) => void;
}

/** Status, how it was paid or why it was turned down, and the next action for finance. */
export function PayoutStatus({
  row,
  target,
  actions,
}: {
  readonly row: PayoutRow;
  readonly target: PayoutTarget;
  readonly actions: PayoutActions;
}) {
  const { onApprove, onReject, onPay } = actions;
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
        {row.status === 'approved' && canPay && (
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Wallet />}
            onClick={() => onPay(target)}
          >
            {t('pay')}
          </Button>
        )}
      </span>
      {detail && <span className="type-body-sm text-ink-faint">{detail}</span>}
    </span>
  );
}
