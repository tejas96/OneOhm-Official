'use client';

import type { DutyDaySegment } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { Pause, Play } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type CSSProperties, useMemo } from 'react';
import { fractionOf, SPEEDS, segmentTicks, timeAt } from './replay';
import type { Replay } from './use-replay';

/** The colour of each kind on the bar, as on the timeline. */
const TICK: Readonly<Record<DutyDaySegment['kind'], string>> = {
  travel: 'var(--oh-duty-moving)',
  visit: 'var(--oh-duty-visit)',
  gap: 'var(--oh-duty-gap)',
  stop: 'var(--oh-ink-faint)',
};

const STEPS = 1000;

/**
 * The replay's controls: play and pause, the speed, and the day as a bar to drag along, with
 * each segment drawn in its colour so a stop or a gap is easy to find.
 */
export function ReplayBar({
  replay,
  segments,
  className,
}: {
  readonly replay: Replay;
  readonly segments: readonly DutyDaySegment[];
  readonly className?: string;
}) {
  const t = useTranslations('liveMap.replay');
  const format = useFormatter();
  const { span } = replay;
  const ticks = useMemo(() => (span ? segmentTicks(segments, span) : []), [segments, span]);
  if (!span) return null;
  const clock = (ms: number) =>
    format.dateTime(new Date(ms), { hour: '2-digit', minute: '2-digit' });
  const fraction = fractionOf(replay.t, span);
  return (
    <div
      className={cn(
        'live-glass pointer-events-auto flex items-center gap-3 rounded-2xl px-2.5 py-2',
        className,
      )}
    >
      <button
        type="button"
        onClick={replay.playing ? replay.pause : replay.play}
        aria-label={replay.playing ? t('pause') : t('play')}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-e2 transition-transform duration-(--duration-fast) hover:bg-accent-hover active:scale-95 [&_svg]:size-5"
      >
        {replay.playing ? (
          <Pause aria-hidden fill="currentColor" />
        ) : (
          <Play aria-hidden fill="currentColor" className="translate-x-px" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 whitespace-nowrap type-label tabular-nums text-ink-faint">
          <span>{clock(span.start)}</span>
          <span className="type-body-sm font-semibold text-ink">{clock(replay.t)}</span>
          <span>{clock(span.end)}</span>
        </div>
        <div className="relative h-6">
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-sunken"
          >
            {ticks.map((tick) => (
              <span
                key={`${tick.kind}-${tick.fraction}`}
                className="absolute inset-y-0"
                style={{
                  left: `${tick.fraction * 100}%`,
                  width: `${Math.max(tick.width * 100, 0.4)}%`,
                  background: tick.flagged ? 'var(--oh-duty-idle)' : TICK[tick.kind],
                  opacity: tick.kind === 'stop' && !tick.flagged ? 0.45 : 0.9,
                }}
              />
            ))}
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-raised shadow-[0_0_0_2px_var(--oh-accent),var(--oh-shadow-e2)]"
            style={{ left: `${fraction * 100}%` } as CSSProperties}
          />
          <input
            type="range"
            min={0}
            max={STEPS}
            step={1}
            value={Math.round(fraction * STEPS)}
            onChange={(event) => replay.seek(timeAt(Number(event.target.value) / STEPS, span))}
            aria-label={t('scrub')}
            aria-valuetext={clock(replay.t)}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
      <fieldset className="m-0 flex shrink-0 rounded-lg border-0 bg-sunken p-0.5">
        <legend className="sr-only">{t('speed')}</legend>
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            aria-pressed={replay.speed === speed}
            onClick={() => replay.setSpeed(speed)}
            className={cn(
              'h-8 min-w-9 rounded-md px-1.5 type-label tabular-nums transition-colors duration-(--duration-fast)',
              replay.speed === speed
                ? 'bg-raised font-semibold text-ink shadow-e1'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {speed}×
          </button>
        ))}
      </fieldset>
    </div>
  );
}
