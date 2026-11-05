'use client';

import type { Payable, PayoutRequest } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';
import { describeError } from '@/lib/api/api-error';
import { useWithdrawRequest } from './use-payouts';

/** An open "ask to send": who asked for how much; the asker may withdraw it. */
export function RequestNote({
  bill,
  request,
  canSend,
}: {
  readonly bill: Payable;
  readonly request: PayoutRequest;
  readonly canSend: boolean;
}) {
  const t = useTranslations('finance.payables.bank.request');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const withdraw = useWithdrawRequest();
  const amount = formatInr(request.amountPaise);
  const when = format.relativeTime(new Date(request.requestedAt), now);
  const who = request.requestedByName ?? t('someone');
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md bg-sunken px-3 py-2.5 type-body-sm text-ink"
    >
      <span>
        {canSend
          ? t('askedYou', { name: who, amount, when })
          : request.mine
            ? t('askedMine', { amount, when })
            : t('askedOther', { name: who, amount, when })}
      </span>
      {request.mine && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          pending={withdraw.isPending}
          onClick={() => withdraw.mutate(bill.id)}
        >
          {t('withdraw')}
        </Button>
      )}
      <FormError message={withdraw.isError ? describeError(withdraw.error) : null} />
    </div>
  );
}
