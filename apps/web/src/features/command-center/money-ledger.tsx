'use client';

import type { CommandCenter } from '@oneohm/api-contracts';
import { formatInrCompact } from '@oneohm/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SectionHeading } from './section-heading';

interface LedgerRow {
  readonly key: string;
  readonly value: number;
  readonly href: string;
  /** Shown instead of the key's own label (one that takes values). */
  readonly label?: string;
}

/**
 * Money set as a ledger with leader dots: what was earned and comes in (customers and
 * banks) beside everything still owed to vendors and crews. Each line opens its records.
 */
export function MoneyLedger({
  money,
  dueSoonDays,
}: {
  readonly money: CommandCenter['money'];
  readonly dueSoonDays: number;
}) {
  const t = useTranslations('commandCenter.money');
  const comingIn: readonly LedgerRow[] = [
    { key: 'revenue', value: money.revenuePaise, href: '/finance?tab=ledger' },
    { key: 'collected', value: money.collectedPaise, href: '/finance?tab=receivables' },
    { key: 'stillDue', value: money.stillDuePaise, href: '/finance?tab=receivables' },
    { key: 'fromBanks', value: money.bankPendingPaise, href: '/finance?tab=loans' },
  ];
  const goingOut: readonly LedgerRow[] = [
    { key: 'toVendors', value: money.toVendorsPaise, href: '/finance?tab=payables' },
    { key: 'toContractors', value: money.toContractorsPaise, href: '/finance?tab=payables' },
    {
      key: 'dueThisWeek',
      value: money.dueThisWeekPaise,
      href: '/finance?tab=payables',
      label: t('dueThisWeek', { days: dueSoonDays }),
    },
    { key: 'advances', value: money.advancesPaise, href: '/finance?tab=advances' },
  ];
  return (
    <section id="money" aria-label={t('title')} className="flex scroll-mt-24 flex-col gap-5">
      <SectionHeading index="02" title={t('title')} />
      <div className="grid gap-x-16 gap-y-8 lg:grid-cols-2">
        <Ledger heading={t('comingIn')} rows={comingIn} />
        <Ledger heading={t('goingOut')} rows={goingOut} />
      </div>
      <p className="type-label text-ink-faint">{t('note')}</p>
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
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              className="group -mx-2 flex items-baseline gap-3 rounded-md px-2 py-2.5 hover:bg-surface"
            >
              <span className="type-body text-ink-muted group-hover:text-ink">
                {row.label ?? t(row.key)}
              </span>
              <span aria-hidden className="flex-1 border-b border-dotted border-rule" />
              <span className="type-display-md text-ink tabular-nums">
                {formatInrCompact(row.value)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
