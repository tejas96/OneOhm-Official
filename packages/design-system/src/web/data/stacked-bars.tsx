'use client';

import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { easing, seconds } from '../motion/presets';
import { Tooltip } from '../overlays/popover';

export interface BarSeries {
  readonly key: string;
  readonly label: string;
  /** A fill class from the theme, e.g. `bg-on-track-solid` or `bg-party-discom`. */
  readonly fill: string;
}

export interface StackedBarDatum {
  readonly key: string;
  /** What the bar is, in full ("Week of 2 Nov"), for the tooltip and screen readers. */
  readonly label: string;
  /** Short axis label under the bar ("2 Nov"); decorative, `label` carries the meaning. */
  readonly tick?: string;
  readonly values: Readonly<Record<string, number>>;
}

interface StackedBarsProps {
  readonly data: readonly StackedBarDatum[];
  /** Bottom to top. */
  readonly series: readonly BarSeries[];
  readonly label: string;
  /** Formats one value for the tooltip (money, days, kWp). */
  readonly format?: (value: number) => string;
  readonly height?: number;
  readonly className?: string;
}

const plain = (value: number) => Math.round(value).toLocaleString('en-IN');

/**
 * Bars over time, each split into parts (on time / late; internal / customer / bank /
 * DISCOM). The legend names the colours and every bar has a tooltip with exact values.
 */
export function StackedBars({
  data,
  series,
  label,
  format = plain,
  height = 120,
  className,
}: StackedBarsProps) {
  const total = (datum: StackedBarDatum) =>
    series.reduce((sum, part) => sum + Math.max(0, datum.values[part.key] ?? 0), 0);
  const max = Math.max(1, ...data.map(total));
  const describe = (datum: StackedBarDatum) =>
    `${datum.label}: ${series
      .map((part) => `${part.label} ${format(datum.values[part.key] ?? 0)}`)
      .join(', ')}`;
  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <ul aria-label={label} className="flex items-end gap-1.5" style={{ height }}>
        {data.map((datum, index) => {
          const parts = series.filter((part) => (datum.values[part.key] ?? 0) > 0);
          return (
            <li key={datum.key} className="flex h-full min-w-2 flex-1">
              <Tooltip content={describe(datum)}>
                <button
                  type="button"
                  aria-label={describe(datum)}
                  className="flex h-full min-w-2 flex-1 flex-col-reverse justify-start gap-[2px] rounded-sm outline-offset-2"
                >
                  {parts.length === 0 && <span className="h-[2px] rounded-full bg-hairline" />}
                  {parts.map((part, position) => (
                    <motion.span
                      key={part.key}
                      className={cn(
                        'block origin-bottom',
                        part.fill,
                        position === parts.length - 1 ? 'rounded-t-[4px]' : 'rounded-[1px]',
                      )}
                      style={{
                        height: Math.max(2, ((datum.values[part.key] ?? 0) / max) * height - 1),
                      }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{
                        duration: seconds('data'),
                        ease: easing('outExpo'),
                        delay: index * 0.03 + position * 0.05,
                      }}
                    />
                  ))}
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      {data.some((datum) => datum.tick) && (
        <div aria-hidden className="-mt-1.5 flex gap-1.5">
          {data.map((datum) => (
            <span
              key={datum.key}
              className="min-w-2 flex-1 truncate text-center font-mono text-[0.6875rem] text-ink-faint tabular-nums"
            >
              {datum.tick ?? ''}
            </span>
          ))}
        </div>
      )}
      <figcaption className="flex flex-wrap gap-4 type-body-sm text-ink-muted">
        {series.map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2.5 rounded-[3px]', part.fill)} />
            {part.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
