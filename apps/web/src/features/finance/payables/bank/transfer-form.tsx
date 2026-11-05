'use client';

import type { Payable, PayoutOptions } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { describeError } from '@/lib/api/api-error';
import { amountFaultOf, amountIsOk, checkAmount } from '../amount-check';
import { AmountBox } from './amount-box';
import { ConfirmSend } from './confirm-send';
import { sendErrorLine } from './payout-status';
import { RequestNote } from './request-note';
import { SendActions } from './send-actions';
import { TransferSummary } from './transfer-summary';
import { useAskToSend, useSendPayout } from './use-payouts';

type Payee = NonNullable<PayoutOptions['payee']>;

/**
 * The "Send to bank" form: the facts, the amount (all that is left, or a part), then
 * Pay, a confirm step and Yes, send. Without the right to send it offers Ask to send.
 */
export function TransferForm({
  bill,
  data,
  payee,
  onConfirming,
}: {
  readonly bill: Payable;
  readonly data: PayoutOptions;
  readonly payee: Payee;
  /** Told when the confirm step opens or closes, so the panel can hide old news. */
  readonly onConfirming?: (confirming: boolean) => void;
}) {
  const t = useTranslations('finance.payables.bank');
  const toast = useToast();
  const send = useSendPayout();
  const ask = useAskToSend();
  const left = data.leftPaise;
  const requested = data.request?.amountPaise ?? data.amountPaise;
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => onConfirming?.(confirming), [confirming, onConfirming]);
  const amount = typed === undefined ? Math.min(requested, left) : typed;
  const check = checkAmount(amount, left);
  const name = payee.accountName ?? payee.name;
  const waiting = data.request !== null && !data.canSend;
  const failure = send.isError ? send.error : ask.isError ? ask.error : null;
  // Low balance and a bank refusal already show in the transfer's own box above.
  // A field error from the server (someone else paid meanwhile) goes next to the box.
  const amountFault = amountFaultOf(failure);
  const failureLine = amountFault === null ? sendErrorLine(failure, data.latest) : null;
  const doSend = () => {
    if (send.isPending || !amountIsOk(check)) return;
    send.mutate(
      { billId: bill.id, amountPaise: amount ?? 0 },
      {
        onSuccess: () => {
          setConfirming(false);
          toast({ tone: 'success', title: t('sent'), description: bill.partyName });
        },
        onError: () => setConfirming(false),
      },
    );
  };
  const doAsk = () => {
    if (!amountIsOk(check) || ask.isPending) return;
    ask.mutate(
      { billId: bill.id, amountPaise: amount ?? 0 },
      { onSuccess: () => toast({ tone: 'success', title: t('ask.done') }) },
    );
  };

  if (confirming)
    return (
      <ConfirmSend
        amountPaise={amount ?? 0}
        name={name}
        last4={payee.accountMasked ?? ''}
        pending={send.isPending}
        error={send.isError ? describeError(send.error) : null}
        onYes={doSend}
        onBack={() => setConfirming(false)}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      {data.request && <RequestNote bill={bill} request={data.request} canSend={data.canSend} />}
      <TransferSummary payee={payee} amountPaise={amount ?? 0} feeEstimate={data.feeEstimate} />
      {!waiting && (
        <AmountBox
          label={t('amount.label')}
          hint={t('amount.hint')}
          amount={amount}
          left={left}
          check={check}
          serverError={amountFault}
          onChange={(value) => {
            setTyped(value);
            send.reset();
            ask.reset();
          }}
        />
      )}
      <SendActions
        data={data}
        payLabel={amountIsOk(check) ? t('pay', { amount: formatInr(amount ?? 0) }) : t('payNone')}
        asking={ask.isPending}
        blocked={!amountIsOk(check)}
        onPay={() => amountIsOk(check) && setConfirming(true)}
        onAsk={doAsk}
      />
      <FormError message={failureLine} />
    </div>
  );
}
