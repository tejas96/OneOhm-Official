'use client';

import { Button, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { useOnlinePayments } from '../payment-link-action';
import { useInvalidateFinance } from '../use-finance';

/**
 * Asks Razorpay now for payments on open links (it also checks every 5 minutes), for
 * when a customer says "I paid" and finance wants to see it straight away.
 */
export function GatewayCheckButton() {
  const t = useTranslations('finance.links');
  const toast = useToast();
  const canRecord = useCan('finance.record_payments');
  const setup = useOnlinePayments();
  const invalidate = useInvalidateFinance();
  const check = useMutation({
    mutationFn: () => expectStatus(api.gatewayCheck.checkGateway({ body: {} }), 200),
    onSuccess: async (result) => {
      await invalidate();
      toast({
        title:
          result.recorded > 0 ? t('checkFound', { count: result.recorded }) : t('checkNothing'),
        tone: result.recorded > 0 ? 'success' : 'info',
      });
    },
    onError: (error) => toast({ title: describeError(error), tone: 'error' }),
  });
  if (!canRecord || setup.data?.mode !== 'live') return null;
  return (
    <Button
      size="sm"
      variant="quiet"
      leadingIcon={<RefreshCw />}
      pending={check.isPending}
      onClick={() => check.mutate()}
    >
      {t('check')}
    </Button>
  );
}
