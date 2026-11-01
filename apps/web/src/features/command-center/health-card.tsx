'use client';

import type { CommandCenter, CommandCenterQuery } from '@oneohm/api-contracts';
import { Card, type PillTone, Popover, ProgressRing, StatusPill } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { centerHref } from './center-links';

const WEIGHT = { delivery: 0.4, money: 0.35, team: 0.25 } as const;
const HREF = {
  delivery: { path: '/command-center/tasks', show: 'overdue' },
  money: { path: '/finance?tab=receivables', show: null },
  team: { path: '/command-center/tasks', show: 'unassigned' },
} as const;
type Factor = keyof typeof WEIGHT;

function standing(score: number): { tone: PillTone; key: 'healthy' | 'atRisk' | 'critical' } {
  if (score >= 75) return { tone: 'onTrack', key: 'healthy' };
  if (score >= 50) return { tone: 'atRisk', key: 'atRisk' };
  return { tone: 'overdue', key: 'critical' };
}

/** The health score, what it means, and the parts pulling it down, each with a way in. */
export function HealthCard({
  data,
  query,
}: {
  readonly data: CommandCenter;
  readonly query: CommandCenterQuery;
}) {
  const t = useTranslations('commandCenter.healthCard');
  const { health, kpis, collections } = data;
  const { tone, key } = standing(health.score);
  const contributors = (Object.keys(WEIGHT) as Factor[])
    .map((factor) => ({ factor, impact: -(100 - health[factor]) * WEIGHT[factor] }))
    .filter((item) => item.impact < -0.05)
    .sort((a, b) => a.impact - b.impact);
  const detail = (factor: Factor) => {
    if (factor === 'delivery')
      return t('delivery.detail', { overdue: kpis.overdueTasks, open: kpis.openTasks });
    if (factor === 'money')
      return t('money.detail', {
        collected: formatInrCompact(collections.collectedPaise),
        due: formatInrCompact(collections.duePaise),
      });
    return t('team.detail', { unassigned: kpis.unassignedTasks, open: kpis.openTasks });
  };
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
        <ProgressRing
          value={health.score / 100}
          label={`${t('title')}: ${health.score}`}
          size={120}
          thickness={9}
          paint="brand"
          trackClassName="stroke-sunken"
        >
          <span className="type-display-lg text-ink tabular-nums">{health.score}</span>
          <span className="font-mono text-[0.75rem] text-ink-faint">/ 100</span>
        </ProgressRing>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="type-title-lg text-ink">{t('title')}</h2>
            <StatusPill tone={tone} label={t(key)} />
            <Popover
              label={t('how')}
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 type-body-sm text-ink-muted hover:text-ink"
                >
                  <Info aria-hidden className="size-4" />
                  {t('how')}
                </button>
              }
            >
              <p className="max-w-xs type-body-sm text-ink">{t('formula')}</p>
            </Popover>
          </div>
          <p className="type-body text-ink-muted">{t('explain')}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-hairline px-6 py-4">
        <p className="type-label text-ink-faint">{t('contributors')}</p>
        {contributors.length === 0 && (
          <p className="py-2 type-body-sm text-ink-muted">{t('none')}</p>
        )}
        <ul className="flex flex-col divide-y divide-hairline">
          {contributors.map(({ factor, impact }) => (
            <li key={factor} className="flex flex-wrap items-center gap-x-5 gap-y-1 py-3">
              <span className="w-14 font-serif text-[1.5rem] leading-none text-overdue tabular-nums">
                {impact.toFixed(Math.abs(impact) < 10 ? 1 : 0)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-sm font-medium text-ink">{t(`${factor}.title`)}</span>
                <span className="type-body-sm text-ink-muted">{detail(factor)}</span>
              </span>
              <Link
                href={
                  HREF[factor].show
                    ? centerHref(HREF[factor].path, query, { show: HREF[factor].show })
                    : HREF[factor].path
                }
                className="inline-flex items-center gap-1 type-body-sm text-accent hover:underline"
              >
                {t(`${factor}.link`)}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
