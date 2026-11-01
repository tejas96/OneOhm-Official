'use client';

import type { DiscomDesk } from '@oneohm/api-contracts';
import { Card, CardHeader, SegmentedControl } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type View = 'step' | 'office';

interface Row {
  readonly key: string;
  readonly discomCode: string;
  readonly label: string;
  readonly averageDays: number;
  readonly samples: number;
}

/**
 * Which DISCOM step, or which DISCOM office, takes longest (PRD 3.16), so the business
 * sees where utility time goes. Earlier waits of resumed work are counted too.
 */
export function StepAverages({ desk }: { readonly desk: DiscomDesk }) {
  const t = useTranslations('discom.steps');
  const [view, setView] = useState<View>('step');
  const rows: Row[] =
    view === 'step'
      ? desk.stepAverages.map((row) => ({ ...row, key: row.step, label: row.step }))
      : desk.officeAverages.map((row) => ({ ...row, key: row.office, label: row.office }));
  const shown = rows.slice(0, 8);
  const longest = Math.max(1, ...shown.map((row) => row.averageDays));
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={view === 'step' ? t('title') : t('officeTitle')}
        description={view === 'step' ? t('description') : t('officeDescription')}
      />
      <div className="px-5 pb-4">
        <SegmentedControl<View>
          size="sm"
          label={t('view')}
          value={view}
          onValueChange={setView}
          options={[
            { value: 'step', label: t('byStep') },
            { value: 'office', label: t('byOffice') },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-hairline px-5 py-5 type-body-sm text-ink-muted">
          {view === 'step' ? t('empty') : t('officeEmpty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3 border-t border-hairline px-5 py-4">
          {shown.map((row) => (
            <li key={`${row.discomCode}-${row.key}`} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3 type-body-sm">
                <span className="min-w-0 truncate text-ink">
                  <span className="font-mono text-[0.75rem] text-ink-faint">
                    {row.discomCode} ·{' '}
                  </span>
                  {row.label}
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
