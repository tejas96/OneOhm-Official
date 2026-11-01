'use client';

import type { FinanceOverview } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { formatInr, formatInrCompact } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

type Month = FinanceOverview['monthly'][number];

/** Validated pair (light on white, dark on charcoal): money in, money out. */
const SERIES = {
  in: 'bg-[#006EAA] dark:bg-[#2F95D3]',
  out: 'bg-[#A9583A] dark:bg-[#D46F3F]',
} as const;

/** Clean axis ticks from zero: a step of 1, 2, 2.5 or 5 × 10ⁿ, about four of them. */
function niceTicks(value: number): number[] {
  const max = value > 0 ? value : 1_000_000;
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= rough) ?? 10) * power;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, index) => step * (count - index));
}

/**
 * Money received and bills paid, month by month: grouped columns on one axis, a legend
 * above, a tooltip per month on hover or focus, and the same figures as a table.
 */
export function CashFlowChart({ months }: { readonly months: readonly Month[] }) {
  const t = useTranslations('finance.overview.cashFlow');
  const format = useFormatter();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const ticks = niceTicks(Math.max(...months.flatMap((month) => [month.inPaise, month.outPaise])));
  const top = ticks[0] ?? 1;
  const label = (month: string) =>
    format.dateTime(new Date(`${month}-01T12:00:00`), { month: 'short' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex items-center gap-4 type-label text-ink-muted">
          {(['in', 'out'] as const).map((series) => (
            <li key={series} className="inline-flex items-center gap-2">
              <span aria-hidden className={cn('size-2.5 rounded-[3px]', SERIES[series])} />
              {t(series)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          className="type-label font-medium text-accent hover:underline"
        >
          {asTable ? t('showChart') : t('showTable')}
        </button>
      </div>
      {asTable ? (
        <table className="w-full type-body-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr className="text-left type-label text-ink-faint">
              <th className="py-2 font-medium">{t('month')}</th>
              <th className="py-2 text-right font-medium">{t('in')}</th>
              <th className="py-2 text-right font-medium">{t('out')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {months.map((month) => (
              <tr key={month.month}>
                <td className="py-2 text-ink-muted">{label(month.month)}</td>
                <td className="py-2 text-right font-mono text-ink">{formatInr(month.inPaise)}</td>
                <td className="py-2 text-right font-mono text-ink">{formatInr(month.outPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <div aria-hidden className="relative h-48 w-12">
            <div className="absolute inset-x-0 top-0 bottom-6">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-0 -translate-y-1/2 font-mono text-[0.6875rem] text-ink-faint"
                  style={{ top: `${(1 - tick / top) * 100}%` }}
                >
                  {formatInrCompact(tick)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative h-48">
            <div aria-hidden className="absolute inset-x-0 top-0 bottom-6">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute inset-x-0 h-px bg-hairline"
                  style={{ top: `${(1 - tick / top) * 100}%` }}
                />
              ))}
            </div>
            <div className="absolute inset-0 flex items-stretch justify-around">
              {months.map((month, index) => (
                <button
                  key={month.month}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  aria-label={t('aria', {
                    month: label(month.month),
                    in: formatInr(month.inPaise),
                    out: formatInr(month.outPaise),
                  })}
                  className="relative flex flex-1 flex-col items-center justify-end rounded-md outline-none focus-visible:bg-sunken/60 hover:bg-sunken/40"
                >
                  <span className="flex h-[calc(100%-1.5rem)] items-end gap-0.5">
                    {(['in', 'out'] as const).map((series) => (
                      <span
                        key={series}
                        className={cn('w-3 rounded-t-[4px] sm:w-5', SERIES[series])}
                        style={{ height: `${(month[`${series}Paise`] / top) * 100}%` }}
                      />
                    ))}
                  </span>
                  <span className="h-6 pt-1.5 type-label text-ink-faint">{label(month.month)}</span>
                  {active === index && (
                    <span
                      role="tooltip"
                      className={cn(
                        'absolute bottom-full z-10 mb-1 flex flex-col gap-1 whitespace-nowrap rounded-md bg-raised px-3 py-2 text-left shadow-e3 ring-1 ring-hairline',
                        index >= months.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                      )}
                    >
                      <span className="type-label font-medium text-ink">{label(month.month)}</span>
                      {(['in', 'out'] as const).map((series) => (
                        <span
                          key={series}
                          className="flex items-center justify-between gap-3 type-label text-ink-muted"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className={cn('size-2 rounded-[2px]', SERIES[series])}
                            />
                            {t(series)}
                          </span>
                          <span className="font-mono text-ink">
                            {formatInr(month[`${series}Paise`])}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
