'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { easing, seconds } from '../motion/presets';

export interface DonutSegment {
  readonly key: string;
  readonly value: number;
  /** Tailwind stroke class, e.g. `stroke-party-discom`. */
  readonly strokeClassName: string;
}

interface DonutChartProps {
  readonly segments: readonly DonutSegment[];
  /** Accessible summary; the legend beside the chart carries the numbers. */
  readonly label: string;
  readonly size?: number;
  readonly thickness?: number;
  /** Gap between segments, in degrees. */
  readonly gap?: number;
  readonly children?: ReactNode;
  readonly className?: string;
}

/** Parts of a whole as a ring; each segment sweeps in after the one before it. */
export function DonutChart({
  segments,
  label,
  size = 160,
  thickness = 14,
  gap = 3,
  children,
  className,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const gapLength = total > 0 ? (gap / 360) * circumference : 0;
  let offset = 0;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-sunken"
        />
        {segments.map((segment, index) => {
          const length = total > 0 ? (segment.value / total) * circumference : 0;
          const visible = Math.max(0, length - gapLength);
          const start = offset;
          offset += length;
          return (
            <motion.circle
              key={segment.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={thickness}
              strokeLinecap="butt"
              className={segment.strokeClassName}
              strokeDashoffset={-start}
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray: `${visible} ${circumference - visible}` }}
              transition={{
                duration: seconds('data'),
                ease: easing('outExpo'),
                delay: index * 0.12,
              }}
            />
          );
        })}
      </svg>
      {children && (
        <span className="relative flex flex-col items-center leading-none">{children}</span>
      )}
    </span>
  );
}
