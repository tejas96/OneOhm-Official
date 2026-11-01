'use client';

import type { Payable } from '@oneohm/api-contracts';
import { Badge, Button, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Landmark } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ListSkeleton } from '@/components/query-state';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { usePayoutOptions, useSendPayout } from './use-payouts';

/**
 * Pay the bill straight to the payee's bank through RazorpayX. The bill is marked paid
 * when the bank confirms the transfer, with its UTR (PRD 3.11).
 */
export function BankTransferPanel({
  bill,
  onSent,
}: {
  readonly bill: Payable;
  readonly onSent: () => void;
}) {
  const t = useTranslations('finance.payables.bank');
  const format = useFormatter();
  const now = useNow();
  const toast = useToast();
  const canSend = useCan('finance.approve_payments');
  const options = usePayoutOptions(bill.id);
  const send = useSendPayout(() => {
    toast({ tone: 'success', title: t('sent'), description: bill.partyName });
    onSent();
  });
  if (options.isPending) return <ListSkeleton label={t('loading')} rows={2} />;
  const data = options.data;
  if (!data) return null;
  const latest = data.latest;
  const rows = [
    [t('to'), data.payee?.accountName ?? data.payee?.name ?? '—'],
    [
      t('account'),
      data.payee?.accountMasked ? `${data.payee.accountMasked} · ${data.payee.ifsc ?? ''}` : '—',
    ],
    [t('how'), t(`mode.${data.transferMode}`)],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      {data.mode === 'sandbox' && (
        <Badge variant="soft" className="self-start">
          {t('practice')}
        </Badge>
      )}
      <dl className="grid gap-2 rounded-xl border border-hairline p-4 type-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-ink-faint">{label}</dt>
            <dd className="text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {latest && (
        <p className="type-body-sm text-ink-muted">
          {t(`latest.${latest.status}`, {
            amount: formatInr(latest.amountPaise),
            when: format.relativeTime(new Date(latest.updatedAt), now),
            reason: latest.failureReason ?? '',
            utr: latest.utr ?? '',
          })}
        </p>
      )}
      {data.problem ? (
        <p role="status" className="rounded-md bg-sunken px-3 py-2.5 type-body-sm text-ink-muted">
          {t(`problem.${data.problem}`)}
        </p>
      ) : canSend ? (
        <Button
          variant="primary"
          leadingIcon={<Landmark />}
          pending={send.isPending}
          onClick={() => send.mutate(bill.id)}
        >
          {t('send', { amount: formatInr(data.amountPaise) })}
        </Button>
      ) : (
        <p className="type-body-sm text-ink-faint">{t('needsApprover')}</p>
      )}
      {send.isError && <p className="type-body-sm text-overdue">{describeError(send.error)}</p>}
    </div>
  );
}
