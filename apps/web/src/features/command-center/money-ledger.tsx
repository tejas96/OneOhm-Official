'use client';

import { formatInrCompact } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { MONEY } from './preview-more';
import { SectionHeading } from './section-heading';

interface LedgerRow {
  readonly key: string;
  readonly value: number;
}

/**
 * Money set as a ledger with leader dots: what comes in (customers and banks) beside
 * what goes out this week (vendors and contractors).
 */
export function MoneyLedger() {
  const t = useTranslations('commandCenter.money');
  const comingIn: readonly LedgerRow[] = [
    { key: 'collected', value: MONEY.collected },
    { key: 'stillDue', value: MONEY.stillDue },
    { key: 'fromBanks', value: MONEY.receivables.bank },
  ];
  const goingOut: readonly LedgerRow[] = [
    { key: 'toVendors', value: MONEY.payables.vendors },
    { key: 'toContractors', value: MONEY.payables.contractors },
    { key: 'advances', value: MONEY.advancesThisWeek },
  ];
  return (
    <section aria-label={t('title')} className="flex flex-col gap-5">
      <SectionHeading index="02" title={t('title')} />
      <div className="grid gap-x-16 gap-y-8 lg:grid-cols-2">
        <Ledger heading={t('comingIn')} rows={comingIn} />
        <Ledger heading={t('goingOut')} rows={goingOut} />
      </div>
    </section>
  );
}

function Ledger({
  heading,
  rows,
}: {
  readonly heading: string;
  readonly rows: readonly LedgerRow[];
}) {
  const t = useTranslations('commandCenter.money');
  return (
    <div className="flex flex-col gap-1">
      <p className="type-overline text-ink-faint uppercase">{heading}</p>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline gap-3 py-2.5">
            <dt className="type-body text-ink-muted">{t(row.key)}</dt>
            <span aria-hidden className="flex-1 border-b border-dotted border-rule" />
            <dd className="type-display-md text-ink tabular-nums">{formatInrCompact(row.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
