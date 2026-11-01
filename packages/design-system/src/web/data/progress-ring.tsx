'use client';

import { motion } from 'motion/react';
import { type ReactNode, useId } from 'react';
import { BRAND_GRADIENT_STOPS } from '../../tokens/brand';
import { cn } from '../lib/cn';
import { dataTransition } from '../motion/presets';

interface ProgressRingProps {
  /** 0–1. Values outside are clamped. */
  readonly value: number;
  /** Accessible description, e.g. "Business health 82 of 100". */
  readonly label: string;
  readonly size?: number;
  readonly thickness?: number;
  /**
   * `tone` draws the arc in the current text colour (set it with `toneClassName`);
   * `brand` draws it in the logo gradient — spend that once per screen.
   */
  readonly paint?: 'tone' | 'brand';
  readonly toneClassName?: string;
  readonly trackClassName?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

/** A ring that draws on to its value; put the hero number in `children`. */
export function ProgressRing({
  value,
  label,
  size = 64,
  thickness = 5,
  paint = 'tone',
  toneClassName = 'text-ink',
  trackClassName = 'stroke-hairline',
  children,
  className,
}: ProgressRingProps) {
  const gradientId = useId();
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - thickness) / 2;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className={cn('absolute inset-0 -rotate-90', toneClassName)}
      >
        {paint === 'brand' && (
          <defs>
            <linearGradient id={gradientId} x1="1" y1="0" x2="0" y2="1">
              {BRAND_GRADIENT_STOPS.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className={trackClassName}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={paint === 'brand' ? `url(#${gradientId})` : 'currentColor'}
          strokeWidth={thickness}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: clamped, opacity: clamped === 0 ? 0 : 1 }}
          transition={dataTransition}
        />
      </svg>
      {children && (
        <span className="relative flex flex-col items-center leading-none">{children}</span>
      )}
    </span>
  );
}
