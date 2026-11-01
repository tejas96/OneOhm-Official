'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { pageEnter } from '../motion/presets';

interface EmptyStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  /** A small illustration shown instead of the icon (see `Illustration`). */
  readonly illustration?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

/** A calm message where data will be, with the one action that fills it. */
export function EmptyState({
  title,
  description,
  icon,
  illustration,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      {...pageEnter}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-rule px-6 py-12 text-center',
        className,
      )}
    >
      {illustration}
      {icon && !illustration && (
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="type-title-md text-ink">{title}</p>
      {description && <p className="max-w-md type-body-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}
