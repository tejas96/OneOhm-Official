'use client';

import type { DiscomDesk } from '@oneohm/api-contracts';
import { Card, CardHeader } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

/** Which DISCOM step takes longest, so the business sees where utility time goes. */
export function StepAverages({ desk }: { readonly desk: DiscomDesk }) {
  const t = useTranslations('discom.steps');
  const rows = desk.stepAverages.slice(0, 8);
  const longest = Math.max(1, ...rows.map((row) => row.averageDays));
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('title')} description={t('description')} />
      {rows.length === 0 ? (
        <p className="border-t border-hairline px-5 py-5 type-body-sm text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3 border-t border-hairline px-5 py-4">
          {rows.map((row) => (
            <li key={`${row.discomCode}-${row.step}`} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3 type-body-sm">
                <span className="min-w-0 truncate text-ink">
                  <span className="font-mono text-[0.75rem] text-ink-faint">
                    {row.discomCode} ·{' '}
                  </span>
                  {row.step}
                </span>
                <span className="shrink-0 text-ink tabular-nums">
                  {t('days', { days: row.averageDays })}
                  <span className="text-ink-faint"> · {t('samples', { count: row.samples })}</span>
                </span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <span
                  className="block h-full rounded-full bg-party-discom"
                  style={{ width: `${(row.averageDays / longest) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
