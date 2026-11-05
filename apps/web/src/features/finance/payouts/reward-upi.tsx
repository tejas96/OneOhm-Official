'use client';

import type { ReferralReward } from '@oneohm/api-contracts';
import { Button, Input, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { Check, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { useInvalidateFinance } from '../use-finance';

/**
 * The UPI ID a customer shared for their reward (redesign §15): what it is, whether it was checked, and for
 * finance Looks good or Ask again (with a reason the customer reads). Paying by UPI needs it checked.
 */
export function RewardUpi({ reward }: { readonly reward: ReferralReward }) {
  const t = useTranslations('finance.payouts.upi');
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const canCheck = useCan('finance.record_payments');
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const { upi } = reward;

  const check = useMutation({
    mutationFn: (body: { result: 'good' } | { result: 'again'; reason: string }) =>
      expectStatus(
        api.referrals.checkRewardUpi({
          params: { id: reward.id },
          body: { ...body, upiId: upi.id ?? '' },
        }),
        200,
      ),
    onSuccess: async (_done, body) => {
      await invalidate();
      setAsking(false);
      setReason('');
      toast({ title: t(body.result === 'good' ? 'checked' : 'askedAgain'), tone: 'success' });
    },
    onError: (error) =>
      toast({ title: t('failed'), description: describeError(error), tone: 'error' }),
  });

  if (reward.status === 'pending' || reward.status === 'rejected') return null;
  const paidTo = upi.paidTo ? t('paidTo', { id: upi.paidTo }) : null;
  const line =
    paidTo ??
    (upi.ask === 'open' || (!upi.id && upi.ask !== 'closed')
      ? t('waiting')
      : t(upi.checked ? 'looksGood' : 'toCheck', { id: upi.id ?? '' }));
  return (
    <span className="mt-1 flex flex-col gap-1 type-body-sm text-ink-faint">
      <span>{line}</span>
      {canCheck && upi.id && !upi.checked && reward.status === 'approved' && (
        <span className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<Check />}
            pending={check.isPending}
            onClick={() => check.mutate({ result: 'good' })}
          >
            {t('good')}
          </Button>
          {asking ? (
            <>
              <Input
                aria-label={t('reason')}
                placeholder={t('reason')}
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <Button
                size="sm"
                variant="primary"
                pending={check.isPending}
                onClick={() => check.mutate({ result: 'again', reason: reason.trim() })}
              >
                {t('send')}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="quiet"
              leadingIcon={<RotateCcw />}
              onClick={() => setAsking(true)}
            >
              {t('again')}
            </Button>
          )}
        </span>
      )}
    </span>
  );
}
