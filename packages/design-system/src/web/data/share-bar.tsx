'use client';

import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { easing, seconds } from '../motion/presets';

export interface ShareSegment {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Tailwind background class for the segment and its legend dot, e.g. `bg-party-discom`. */
  readonly colorClassName: string;
}

interface ShareBarProps {
  readonly segments: readonly ShareSegment[];
  /** Accessible summary of the whole bar. */
  readonly label: string;
  readonly format?: (value: number) => string;
  readonly legend?: 'none' | 'inline' | 'rows';
  readonly className?: string;
}

const percent = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

/**
 * One whole split into parts (waiting time by party, receivables by payer). Segments
 * grow in from the left; the legend carries the numbers so colour is never the only cue.
 */
export function ShareBar({
  segments,
  label,
  format = (value) => value.toLocaleString('en-IN'),
  legend = 'inline',
  className,
}: ShareBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);
  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <div role="img" aria-label={label} className="flex h-2.5 w-full gap-[3px]">
        {total === 0 && <span className="h-full w-full rounded-full bg-sunken" />}
        {visible.map((segment, index) => (
          <motion.span
            key={segment.key}
            className={cn(
              'h-full origin-left first:rounded-l-full last:rounded-r-full',
              segment.colorClassName,
            )}
            style={{ flexGrow: segment.value, flexBasis: 0 }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{
              duration: seconds('data'),
              ease: easing('outExpo'),
              delay: index * 0.07,
            }}
          />
        ))}
      </div>
      {legend !== 'none' && (
        <figcaption>
          <ul
            className={cn(
              legend === 'inline' ? 'flex flex-wrap gap-x-4 gap-y-1' : 'flex flex-col gap-2',
            )}
          >
            {segments.map((segment) => (
              <li
                key={segment.key}
                className={cn(
                  'flex items-center gap-2 type-body-sm',
                  legend === 'rows' && 'justify-between',
                )}
              >
                <span className="inline-flex items-center gap-2 text-ink-muted">
                  <span
                    aria-hidden
                    className={cn('size-2.5 rounded-[3px]', segment.colorClassName)}
                  />
                  {segment.label}
                </span>
                <span className="font-mono text-[0.8125rem] text-ink tabular-nums">
                  {format(segment.value)}
                  <span className="ml-1.5 text-ink-faint">{percent(segment.value, total)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </figcaption>
      )}
    </figure>
  );
}
