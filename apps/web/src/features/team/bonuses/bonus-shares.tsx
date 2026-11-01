'use client';

import type { Bonus } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useWorkforceFormat } from '../workforce-format';

/** Each person's share and, once approved, how far finance has paid it. */
export function BonusShares({ bonus }: { readonly bonus: Bonus }) {
  const t = useTranslations('team.bonuses');
  const format = useWorkforceFormat();
  const money = (share: Bonus['shares'][number]) => {
    if (share.payableStatus === 'paid')
      return share.paidOn ? t('paidOn', { day: format.day(share.paidOn) }) : t('paid');
    if (share.payableStatus) return t('awaitingPayment');
    return null;
  };
  return (
    <ul className="flex flex-col gap-1">
      {bonus.shares.map((share) => (
        <li
          key={share.user.id}
          className="flex flex-wrap items-baseline justify-end gap-x-2 md:justify-start"
        >
          <span className="type-body-sm text-ink">{share.user.fullName}</span>
          <span className="font-mono text-[0.8125rem] text-ink-muted tabular-nums">
            {formatInr(share.amountPaise)}
          </span>
          {money(share) && <span className="type-label text-ink-faint">{money(share)}</span>}
        </li>
      ))}
    </ul>
  );
}
