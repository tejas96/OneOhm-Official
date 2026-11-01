'use client';

import type { CommandCenter, CommandCenterQuery } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { centerHref } from './center-links';

const STATES = [
  { key: 'onTrack', dot: 'bg-on-track-solid', health: 'onTrack' },
  { key: 'atRisk', dot: 'bg-at-risk-solid', health: 'atRisk' },
  { key: 'waiting', dot: 'bg-waiting-solid', health: 'waiting' },
  { key: 'blocked', dot: 'bg-blocked-solid', health: 'blocked' },
  { key: 'overdue', dot: 'bg-overdue-solid', health: 'overdue' },
] as const;

/**
 * Live projects by state, then the ones finished in the period (PRD 3.1 "active,
 * completed, delayed, blocked and at-risk"). Each count opens the projects in it.
 */
export function ProjectStates({
  data,
  query,
}: {
  readonly data: CommandCenter;
  readonly query: CommandCenterQuery;
}) {
  const t = useTranslations('commandCenter.states');
  const { states } = data;
  const cell =
    'flex min-w-0 flex-col gap-1 rounded-lg px-4 py-3 transition-colors hover:bg-surface focus-visible:bg-surface';
  return (
    <nav
      aria-label={t('label')}
      className="grid grid-cols-2 gap-1 rounded-xl border border-hairline bg-raised p-1.5 sm:grid-cols-3 xl:grid-cols-6"
    >
      {STATES.map((state) => (
        <Link
          key={state.key}
          href={centerHref('/projects', query, { health: state.health })}
          className={cell}
        >
          <span className="flex items-center gap-2 type-body-sm text-ink-muted">
            <span aria-hidden className={cn('size-2 rounded-full', state.dot)} />
            {t(state.key)}
          </span>
          <span className="type-display-md text-ink tabular-nums">{states[state.key]}</span>
        </Link>
      ))}
      <Link
        href={centerHref('/projects', query, { status: 'completed', since: data.range.start })}
        className={cell}
      >
        <span className="flex items-center gap-2 type-body-sm text-ink-muted">
          <span aria-hidden className="size-2 rounded-full bg-done-solid" />
          {t('completed')}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="type-display-md text-ink tabular-nums">{states.completed}</span>
          {states.completedUnpaid > 0 && (
            <span className="truncate type-label text-overdue">
              {t('unpaid', { count: states.completedUnpaid })}
            </span>
          )}
        </span>
      </Link>
    </nav>
  );
}
