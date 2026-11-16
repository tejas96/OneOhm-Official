'use client';

import { cn } from '@oneohm/design-system/web';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { type LiveFilter, type liveCounts, STATES, toneOf } from './live-format';
import { useNow } from './use-live';

interface HudBarProps {
  readonly counts: ReturnType<typeof liveCounts>;
  readonly filter: LiveFilter;
  readonly onFilter: (filter: LiveFilter) => void;
  /** Open alerts; the bell opens the Alerts tab. */
  readonly alerts: { readonly open: number; readonly red: number };
  readonly onAlerts: () => void;
}

/** Older than two refreshes: the beacon turns amber. */
const STALE_MS = 75_000;

/** "Updated 10 s ago" with the live beacon; amber when the data is old or a refresh failed. */
export function LiveStatus({
  updatedAt,
  failed,
}: {
  readonly updatedAt: number;
  readonly failed: boolean;
}) {
  const t = useTranslations('liveMap');
  const now = useNow();
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  const stale = failed || (updatedAt > 0 && now - updatedAt > STALE_MS);
  return (
    <p className="flex items-center gap-1.5 type-label text-ink-muted" aria-live="polite">
      <span className="live-beacon" data-stale={stale || undefined} />
      {updatedAt === 0
        ? t('updated.never')
        : failed
          ? t('updated.failed')
          : seconds < 5
            ? t('updated.now')
            : t('updated.ago', { seconds: seconds < 60 ? seconds : 60 })}
    </p>
  );
}

/** The top bar: what is happening in numbers, each number a filter, and the open alerts. */
export function HudBar({ counts, filter, onFilter, alerts, onAlerts }: HudBarProps) {
  const t = useTranslations('liveMap');
  const toggle = (next: LiveFilter) => onFilter(filter === next ? 'all' : next);
  return (
    <div className="live-glass pointer-events-auto flex w-fit max-w-full min-w-0 items-center gap-0.5 rounded-2xl p-1.5">
      <h1 className="sr-only">{t('title')}</h1>
      <fieldset
        className={cn(
          'm-0 flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-0.5 overflow-x-auto border-0 p-0 [scrollbar-width:none]',
          // Phones: the row fades at the right edge, so it is clear more chips scroll in.
          'max-2xl:pr-8 max-2xl:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)]',
        )}
      >
        <legend className="sr-only">{t('filters')}</legend>
        <Chip
          label={t('chip.on_duty')}
          count={counts.on_duty}
          tone="var(--oh-energy)"
          active={filter === 'on_duty'}
          onClick={() => toggle('on_duty')}
          lead
        />
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-hairline" />
        {STATES.map((state) => (
          <Chip
            key={state}
            label={t(`chip.${state}`)}
            count={counts[state]}
            tone={toneOf(state)}
            active={filter === state}
            onClick={() => toggle(state)}
          />
        ))}
      </fieldset>
      <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-hairline" />
      <button
        type="button"
        onClick={onAlerts}
        aria-label={t('alertsButton', { count: alerts.open })}
        title={t('alertsButton', { count: alerts.open })}
        data-red={alerts.red > 0 || undefined}
        className={cn(
          'flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 transition-colors duration-(--duration-fast)',
          alerts.open === 0 && 'text-ink-faint hover:bg-sunken',
          alerts.open > 0 &&
            alerts.red === 0 &&
            'bg-at-risk-tint text-at-risk hover:bg-[color-mix(in_oklab,var(--oh-at-risk)_20%,transparent)]',
          alerts.red > 0 &&
            'bg-overdue-tint text-overdue hover:bg-[color-mix(in_oklab,var(--oh-overdue)_20%,transparent)]',
        )}
      >
        <Bell aria-hidden className="size-4" />
        <span className="text-[0.9375rem] font-semibold tabular-nums">{alerts.open}</span>
      </button>
    </div>
  );
}

interface ChipProps {
  readonly label: string;
  readonly count: number;
  readonly tone: string;
  readonly active: boolean;
  readonly onClick: () => void;
  /** The first chip carries the headline number. */
  readonly lead?: boolean;
}

function Chip({ label, count, tone, active, onClick, lead = false }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{ '--tone': tone } as CSSProperties}
      className={cn(
        'flex h-10 shrink-0 snap-start items-center gap-1.5 rounded-xl border border-transparent px-2.5 transition-[background-color,border-color,color] duration-(--duration-fast)',
        'hover:bg-sunken',
        active &&
          'border-[color-mix(in_oklab,var(--tone)_45%,transparent)] bg-[color-mix(in_oklab,var(--tone)_14%,transparent)] hover:bg-[color-mix(in_oklab,var(--tone)_20%,transparent)]',
        count === 0 && !active && 'opacity-55',
      )}
    >
      <span aria-hidden className="size-2 rounded-full bg-(--tone)" />
      <span className="type-label whitespace-nowrap text-ink-muted">{label}</span>
      <span
        className={cn(
          'tabular-nums text-ink',
          lead ? 'font-display text-[1.375rem] leading-none' : 'text-[0.9375rem] font-semibold',
        )}
      >
        {count}
      </span>
    </button>
  );
}
