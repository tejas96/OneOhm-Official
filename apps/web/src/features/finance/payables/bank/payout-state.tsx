'use client';

import type { BankPayout } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Copy, ExternalLink, FileDown, LoaderCircle } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { lastFour, paymentDetailsText } from './copy-details';

const RAZORPAYX_URL = 'https://x.razorpay.com';
const NOTE = 'flex flex-col gap-2 rounded-md bg-sunken px-3 py-2.5 type-body-sm text-ink-muted';

/** What the newest bank transfer is doing, in plain words, with the one next step. */
export function PayoutState({ payout }: { readonly payout: BankPayout }) {
  const t = useTranslations('finance.payables.bank.state');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const amount = formatInr(payout.amountPaise);
  const checked = payout.lastCheckedAt
    ? t('checked', { when: format.relativeTime(new Date(payout.lastCheckedAt), now) })
    : '';
  // The bank's words get "The bank said"; OneOhm's own reasons stand alone (they say what next).
  const reason = !payout.failureReason
    ? ''
    : payout.failureFromBank
      ? t('reason', { reason: payout.failureReason })
      : payout.failureReason;

  if (payout.phase === 'sending')
    return (
      <p role="status" className={NOTE}>
        <span className="flex items-center gap-2 font-medium text-ink">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t('sendingTitle')}
        </span>
        {t('sendingBody', { checked })}
      </p>
    );
  if (payout.phase === 'on_its_way')
    return (
      <p role="status" className={NOTE}>
        <span className="font-medium text-ink">{t('onItsWayTitle', { amount })}</span>
        {t('onItsWayBody', { checked })}
      </p>
    );
  if (payout.phase === 'paid') return <PaidState payout={payout} />;
  // A practice transfer closed when transfers went live: no bank was involved, nothing to fix.
  if (payout.failureCode === 'practice_closed')
    return (
      <p role="status" className={NOTE}>
        {t('practiceClosed', { amount })}
      </p>
    );
  if (payout.lowBalance)
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink"
      >
        <span className="font-medium">{t('lowBalanceTitle')}</span>
        {t('lowBalanceBody', { amount })}
        <Button variant="secondary" size="sm" className="self-start" asChild>
          <a href={RAZORPAYX_URL} target="_blank" rel="noopener noreferrer">
            {t('openRazorpayX')}
            <ExternalLink aria-hidden />
          </a>
        </Button>
      </div>
    );
  return (
    <p
      role="alert"
      className="flex flex-col gap-1 rounded-md bg-overdue-tint px-3 py-2.5 type-body-sm text-ink"
    >
      <span className="font-medium text-overdue">
        {t(payout.phase === 'came_back' ? 'cameBackTitle' : 'failedTitle', { amount })}
      </span>
      {reason}
      {(payout.failureFromBank || !payout.failureReason) && (
        <span>{t(payout.phase === 'came_back' ? 'cameBackNext' : 'failedNext')}</span>
      )}
    </p>
  );
}

/** Paid: when, the UTR, whether the payee was told, and a copy button for WhatsApp. */
function PaidState({ payout }: { readonly payout: BankPayout }) {
  const t = useTranslations('finance.payables.bank.state');
  const format = useFormatter();
  const toast = useToast();
  const amount = formatInr(payout.amountPaise);
  const day = payout.paidOn ? new Date(`${payout.paidOn}T12:00:00`) : new Date(payout.updatedAt);
  const date = format.dateTime(day, { day: 'numeric', month: 'short', year: 'numeric' });
  const utr = payout.utr ?? '—';

  const copy = async () => {
    const text = paymentDetailsText(
      { amount, date, utr, payee: payout.payeeName, last4: lastFour(payout.accountMasked) },
      {
        paid: t('copy.paid'),
        date: t('copy.date'),
        utr: t('copy.utr'),
        account: t('copy.account'),
      },
    );
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: 'success', title: t('copied') });
    } catch {
      toast({ tone: 'error', title: t('copyFailed') });
    }
  };

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md bg-on-track-tint px-3 py-2.5 type-body-sm text-ink"
    >
      <span className="font-medium">{t('paidTitle', { amount, date })}</span>
      <span className="font-mono text-ink-muted">{t('utr', { utr })}</span>
      {payout.payeeTold === 'sent' && <span className="text-ink-muted">{t('told.sent')}</span>}
      {payout.payeeTold === 'off' && <span className="text-ink-muted">{t('told.off')}</span>}
      {payout.payeeTold === 'no_phone' && (
        <span className="text-ink-muted">{t('told.noPhone')}</span>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" leadingIcon={<Copy />} onClick={copy}>
          {t('copyButton')}
        </Button>
        <Button variant="secondary" size="sm" leadingIcon={<FileDown />} asChild>
          <a href={`/api/v1/payouts/${payout.id}/advice.pdf?disposition=attachment`}>
            {t('adviceButton')}
          </a>
        </Button>
      </div>
    </div>
  );
}
