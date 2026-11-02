'use client';

import type { MyRewards } from '@oneohm/api-contracts';
import { cn, EmptyState } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);

/**
 * The person's own month (spec 3.7): points, on-time and first-time-right rates, every
 * missed part with its reason, and their history and bonuses. Points never go down.
 */
export function MyRewardsView() {
  const t = useTranslations('rewards');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['me', 'rewards'],
    queryFn: () => expectStatus(api.engagement.myRewards(), 200),
  });
  if (query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const data: MyRewards = query.data;
  const day = (instant: string) =>
    format.dateTime(new Date(instant), { day: 'numeric', month: 'short' });
  const tiles = [
    { key: 'points', value: String(data.month.points) },
    { key: 'onTime', value: percent(data.month.onTimeRate) },
    { key: 'firstTime', value: percent(data.month.firstTimeRate) },
    { key: 'tasks', value: String(data.month.tasksJudged) },
  ];

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="type-display-lg text-ink">{t('title')}</h1>
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      </header>
      <section aria-label={t('month')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex flex-col gap-1 rounded-xl bg-raised p-4 shadow-e1">
            <span className="type-label text-ink-faint">{t(`tiles.${tile.key}`)}</span>
            <span className="font-mono text-[1.5rem] text-ink tabular-nums">{tile.value}</span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="type-title-lg text-ink">{t('missedTitle')}</h2>
        {data.month.missed.length === 0 ? (
          <p className="type-body-sm text-ink-faint">{t('missedNone')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {data.month.missed.map((line) => (
              <li
                key={`${line.createdAt}-${line.reason}`}
                className="flex justify-between gap-4 py-2.5"
              >
                <span className="type-body text-ink">{line.reason}</span>
                <span className="shrink-0 type-body-sm text-ink-faint">{day(line.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="type-title-lg text-ink">
          {t('historyTitle', { total: data.points.total })}
        </h2>
        {data.points.history.length === 0 ? (
          <EmptyState icon={<Award />} title={t('historyEmpty')} />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {data.points.history.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 py-2.5">
                <span
                  className={cn('type-body', entry.points === 0 ? 'text-ink-muted' : 'text-ink')}
                >
                  {entry.reason}
                  <span className="ml-2 type-body-sm text-ink-faint">{day(entry.createdAt)}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 font-mono tabular-nums',
                    entry.points === 0 ? 'text-at-risk' : 'text-on-track',
                  )}
                >
                  {entry.points === 0 ? t('missed') : `+${entry.points}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.bonuses.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="type-title-lg text-ink">{t('bonusesTitle')}</h2>
          <ul className="flex flex-col divide-y divide-hairline">
            {data.bonuses.map((bonus) => (
              <li key={bonus.id} className="flex justify-between gap-4 py-2.5">
                <span className="type-body text-ink">{bonus.reason}</span>
                <span className="shrink-0 font-mono tabular-nums text-ink">
                  {formatInr(bonus.amountPaise)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
