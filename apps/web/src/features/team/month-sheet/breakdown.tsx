'use client';

import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMonthFormat } from './month-format';
import { breakdownLines, dayCount, lastDayOf } from './month-math';

const Line = ({
  label,
  value,
  strong,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className={strong ? 'type-body font-semibold text-ink' : 'type-body text-ink-muted'}>
      {label}
    </dt>
    <dd
      className={
        strong ? 'type-body font-semibold tabular-nums text-ink' : 'type-body tabular-nums text-ink'
      }
    >
      {value}
    </dd>
  </div>
);

/** How the payable days are made and, for HR and finance, how they become the gross: the real sums. */
export function Breakdown({ person }: { readonly person: MonthSheetPerson }) {
  const t = useTranslations('team.monthSheet.breakdown');
  const words = useMonthFormat();
  const { counts, money } = person.row;
  const lines = breakdownLines(counts);
  const sign = (days: number) => `${days < 0 ? '−' : '+'} ${dayCount(Math.abs(days))}`;
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-1.5">
        {lines.map((line, index) => (
          <Line
            key={line.key}
            label={t(`lines.${line.key}`, {
              count: line.of ?? 0,
              lates: counts.lates,
              every: person.rules.lateEvery,
            })}
            value={
              line.key === 'unpaidOffs'
                ? '—'
                : index === 0 && line.days > 0
                  ? dayCount(line.days)
                  : sign(line.days)
            }
          />
        ))}
        <div className="my-1 border-t border-rule" />
        <Line label={t('payable')} value={dayCount(counts.payableDays)} strong />
      </dl>
      {counts.countedTo < lastDayOf(person.lock.month) && (
        <p className="type-body-sm text-ink-faint">
          {t('countedTo', { date: words.shortDay(counts.countedTo) })}
        </p>
      )}
      {person.showsPay && (
        <div className="flex flex-col gap-1 rounded-lg bg-sunken px-3.5 py-3">
          {money.monthlyPayPaise !== null && money.grossPaise !== null ? (
            <>
              <p className="type-body-sm text-ink-muted tabular-nums">
                {t('sum', {
                  pay: formatInr(money.monthlyPayPaise),
                  days: dayCount(counts.payableDays),
                  month: counts.daysInMonth,
                })}
              </p>
              <p className="type-title-md tabular-nums text-ink">{formatInr(money.grossPaise)}</p>
            </>
          ) : (
            <p className="type-body-sm text-ink-muted">
              {t('noPay')}{' '}
              <Link href="/team?tab=people" className="text-accent hover:underline">
                {t('setPay')}
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
