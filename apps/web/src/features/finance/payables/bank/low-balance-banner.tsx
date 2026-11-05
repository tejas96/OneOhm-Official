'use client';

import { Button } from '@oneohm/design-system/web';
import { ExternalLink, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { lowBalanceBanner } from './payout-status';
import { usePayoutSetup } from './use-payouts';

/** Stays on Payables after a transfer failed for lack of money, until the next good one (U8). */
export function LowBalanceBanner() {
  const t = useTranslations('finance.payables.lowBalance');
  const canSend = useCan('finance.approve_payments');
  const setup = usePayoutSetup(canSend);
  if (!canSend || !lowBalanceBanner(setup.data)) return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl bg-at-risk-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 type-body-sm text-ink">
        <Wallet aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
        <span>
          <span className="font-medium">{t('title')}</span> {t('body')}
        </span>
      </p>
      <Button variant="secondary" size="sm" className="self-start" asChild>
        <a href="https://x.razorpay.com" target="_blank" rel="noopener noreferrer">
          {t('open')}
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </div>
  );
}
