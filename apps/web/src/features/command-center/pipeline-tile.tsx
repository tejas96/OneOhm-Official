'use client';

import type { CommandCenter, CommandCenterQuery } from '@oneohm/api-contracts';
import { cn, easing, seconds } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { centerHref } from './center-links';
import { TILE } from './waiting-tile';

const STEPS = ['leads', 'surveys', 'quotations', 'accepted'] as const;
const FILLS = ['bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'oh-brand-line-x'] as const;
/** Where each step's records live: leads for the first two, quotations for the rest. */
const HREF = {
  leads: '/leads',
  surveys: '/leads?filter=survey_scheduled',
  quotations: '/quotations',
  accepted: '/quotations?filter=accepted',
} as const;

/**
 * The sales funnel as a real funnel: centred bars narrowing to the accepted quotations.
 * The title opens the sales report for the period; each bar opens its list.
 */
export function PipelineTile({
  pipeline,
  query,
  className,
}: {
  readonly pipeline: CommandCenter['pipeline'];
  readonly query: CommandCenterQuery;
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.tiles');
  const stepT = useTranslations('commandCenter.tiles.steps');
  const widest = Math.max(1, pipeline.leads);
  return (
    <section className={cn(TILE, 'flex flex-col gap-5', className)}>
      <Link
        href={centerHref('/reports/sales', query)}
        className="self-start type-overline text-ink-faint uppercase hover:underline"
      >
        {t('pipeline')}
      </Link>
      <ol className="flex flex-col items-center gap-1.5">
        {STEPS.map((step, index) => (
          <motion.li
            key={step}
            className={cn(
              'flex h-9 items-center justify-between rounded-full px-4 type-body-sm',
              FILLS[index],
              index === STEPS.length - 1 ? 'text-on-accent' : 'text-ink',
            )}
            style={{ width: `${Math.max(58, 40 + (pipeline[step] / widest) * 60)}%` }}
            initial={{ scaleX: 0.6, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              duration: seconds('slow'),
              ease: easing('outQuint'),
              delay: 0.15 + index * 0.08,
            }}
          >
            <Link
              href={HREF[step]}
              className="flex w-full items-center justify-between gap-2 outline-offset-4"
            >
              <span className="truncate">{stepT(step)}</span>
              <span className="font-mono font-medium">{pipeline[step]}</span>
            </Link>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
