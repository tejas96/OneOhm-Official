'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { dataTransition, seconds } from '../motion/presets';

interface SparklineProps {
  readonly values: readonly number[];
  readonly label: string;
  readonly className?: string;
  readonly width?: number;
  readonly height?: number;
  /** Fill the area under the line with a fading wash of the line colour. */
  readonly area?: boolean;
}

/** A single-series trend line that draws itself; the last point is marked. */
export function Sparkline({
  values,
  label,
  className,
  width = 160,
  height = 40,
  area = true,
}: SparklineProps) {
  const washId = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 4;
  const points = values.map((value, index) => ({
    x: pad + (index / (values.length - 1)) * (width - pad * 2),
    y: pad + (1 - (value - min) / span) * (height - pad * 2),
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const fill = first && last ? `${line} L${last.x} ${height} L${first.x} ${height} Z` : '';
  return (
    <span className={cn('relative block h-10 w-full text-accent', className)}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        {area && (
          <>
            <defs>
              <linearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity={0.22} />
                <stop offset="1" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <motion.path
              d={fill}
              fill={`url(#${washId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: seconds('slow'), duration: seconds('slow') }}
            />
          </>
        )}
        <motion.path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={dataTransition}
        />
      </svg>
      {last && (
        <motion.span
          aria-hidden
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current bg-raised"
          style={{ left: `${(last.x / width) * 100}%`, top: `${(last.y / height) * 100}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: seconds('data'), duration: seconds('fast') }}
        />
      )}
    </span>
  );
}
