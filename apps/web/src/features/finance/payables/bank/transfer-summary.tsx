'use client';

import type { PayoutOptions } from '@oneohm/api-contracts';
import { transferMode } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { sameName } from './payout-status';

type Payee = NonNullable<PayoutOptions['payee']>;

/** To whom, which account, how fast and what it costs: the facts to read before paying. */
export function TransferSummary({
  payee,
  amountPaise,
  feeEstimate,
}: {
  readonly payee: Payee;
  readonly amountPaise: number;
  readonly feeEstimate: PayoutOptions['feeEstimate'];
}) {
  const t = useTranslations('finance.payables.bank.summary');
  const mode = transferMode(amountPaise);
  const accountName = payee.accountName ?? payee.name;
  const rows: readonly (readonly [string, string])[] = [
    [t('to'), accountName],
    ...(sameName(accountName, payee.name) ? [] : [[t('billedTo'), payee.name] as const]),
    [t('account'), [payee.accountMasked, payee.ifsc].filter(Boolean).join(' · ') || '—'],
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-2 rounded-xl border border-hairline p-4 type-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="shrink-0 text-ink-faint">{label}</dt>
            <dd className="min-w-0 text-right font-medium break-words text-ink">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-ink-faint">{t('speed')}</dt>
          <dd className="min-w-0 text-right">
            <span className="font-medium text-ink">{t(`speedText.${mode}`)}</span>
            <span className="block type-label text-ink-faint">{mode}</span>
          </dd>
        </div>
      </dl>
      <p className="type-body-sm text-ink-muted">
        {feeEstimate
          ? t('fee', { fee: formatInr(feeEstimate.feePaise), gst: formatInr(feeEstimate.gstPaise) })
          : t('feeUnknown')}{' '}
        {t('fromBalance')}
      </p>
    </div>
  );
}
