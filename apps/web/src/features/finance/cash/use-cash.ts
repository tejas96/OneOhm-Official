'use client';

import type { HandledPayment, NewDeposit } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { FINANCE_KEY, useInvalidateFinance } from '../use-finance';

export function useCashPosition() {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'cash'],
    queryFn: () => expectStatus(api.cashHandling.cashPosition(), 200),
  });
}

export function useDeposits() {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'deposits'],
    queryFn: () => expectStatus(api.cashHandling.listDeposits(), 200),
  });
}

export function useDepositItems(id: string | null) {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'deposits', id],
    queryFn: () => expectStatus(api.cashHandling.depositItems({ params: { id: id ?? '' } }), 200),
    enabled: id !== null,
  });
}

export function useCreateDeposit(onDone: () => void) {
  const t = useTranslations('finance.cash.deposit');
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: NewDeposit) => expectStatus(api.cashHandling.createDeposit({ body }), 201),
    onSuccess: async (deposit) => {
      await invalidate();
      onDone();
      toast({ tone: 'success', title: t('done'), description: deposit.number });
    },
  });
}

/** Clear or bounce one cheque; both close it. */
export function useSettleCheque(onDone: () => void) {
  const t = useTranslations('finance.cash.cheque');
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (
      input:
        | { kind: 'clear'; cheque: HandledPayment; clearedOn: string }
        | { kind: 'bounce'; cheque: HandledPayment; bouncedOn: string; reason: string },
    ) =>
      input.kind === 'clear'
        ? expectStatus(
            api.cashHandling.clearCheque({
              params: { paymentId: input.cheque.paymentId },
              body: { clearedOn: input.clearedOn },
            }),
            200,
          )
        : expectStatus(
            api.cashHandling.bounceCheque({
              params: { paymentId: input.cheque.paymentId },
              body: { bouncedOn: input.bouncedOn, reason: input.reason },
            }),
            200,
          ),
    onSuccess: async (cheque) => {
      await invalidate();
      onDone();
      toast({
        tone: cheque.status === 'cleared' ? 'success' : 'info',
        title: t(cheque.status === 'cleared' ? 'cleared' : 'bounced'),
        description: `${cheque.projectCode} · ${cheque.chequeNumber ?? ''}`,
      });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
