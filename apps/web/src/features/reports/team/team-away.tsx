'use client';

import type { TeamReport } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, StatusPill } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

/** Who is away today and who has approved leave coming, soonest first. */
export function AwayList({ rows }: { readonly rows: TeamReport['away'] }) {
  const t = useTranslations('teamReport.away');
  const format = useFormatter();
  const day = (date: string) => new Date(`${date}T00:00:00`);
  const dates = (from: string, to: string) =>
    from === to
      ? format.dateTime(day(from), { day: 'numeric', month: 'short' })
      : format.dateTimeRange(day(from), day(to), { day: 'numeric', month: 'short' });
  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('body')}
        action={
          <Button asChild variant="quiet" size="sm">
            <Link href="/team?tab=leave">{t('open')}</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <p className="px-5 pb-5 type-body-sm text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline px-5 pb-3">
          {rows.map((row) => (
            <li key={row.requestId} className="flex items-start justify-between gap-3 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="type-body-sm font-medium text-ink">{row.name}</span>
                <span className="type-body-sm text-ink-faint">
                  {dates(row.fromDate, row.toDate)} · {row.leaveType}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="whitespace-nowrap type-body-sm text-ink tabular-nums">
                  {t('days', { days: row.halfDays / 2 })}
                </span>
                {row.today && (
                  <StatusPill tone="waiting" glyph="waiting" label={t('today')} size="sm" />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
