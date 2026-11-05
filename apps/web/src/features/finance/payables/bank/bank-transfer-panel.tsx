'use client';

import type { Payable } from '@oneohm/api-contracts';
import { Badge } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { PayoutState } from './payout-state';
import { payoutIsOpen } from './payout-status';
import { PracticeButtons } from './practice-buttons';
import { ProblemNote } from './problem-note';
import { TransferForm } from './transfer-form';
import { usePayoutOptions } from './use-payouts';

/**
 * Pay the bill straight to the payee's bank through RazorpayX. The bill is marked paid
 * when the bank confirms the transfer, with its UTR (PRD 3.11). While a transfer is open
 * the panel only shows where it is: Pay stays locked so nobody pays twice.
 */
export function BankTransferPanel({ bill }: { readonly bill: Payable }) {
  const t = useTranslations('finance.payables.bank');
  const options = usePayoutOptions(bill.id);
  const [confirming, setConfirming] = useState(false);
  if (options.isPending) return <ListSkeleton label={t('loading')} rows={2} />;
  if (options.isError) return <LoadError error={options.error} onRetry={() => options.refetch()} />;
  const data = options.data;
  const latest = data.latest;
  const open = payoutIsOpen(latest);
  // Everything is paid and the bank confirmed: nothing more to send.
  const finished = latest?.phase === 'paid' && data.leftPaise <= 0;
  const canTry = !open && !finished;
  return (
    <div className="flex flex-col gap-4">
      {data.mode === 'sandbox' && !latest?.sandbox && (
        <Badge variant="soft" className="self-start">
          {t('practice.badge')}
        </Badge>
      )}
      {/* While confirming a new send, an old failure is noise: show only the question. */}
      {latest && !(confirming && canTry) && <PayoutState payout={latest} />}
      {latest?.sandbox && <PracticeButtons payout={latest} />}
      {canTry && data.problem !== null && <ProblemNote data={data} />}
      {canTry && data.problem === null && data.payee && (
        <TransferForm
          key={data.request?.id ?? 'none'}
          bill={bill}
          data={data}
          payee={data.payee}
          onConfirming={setConfirming}
        />
      )}
    </div>
  );
}
