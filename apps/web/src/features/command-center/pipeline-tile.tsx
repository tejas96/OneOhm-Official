'use client';

import type { CommandCenter } from '@oneohm/api-contracts';
import { cn, easing, seconds } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { TILE } from './waiting-tile';

const STEPS = ['leads', 'surveys', 'quotations', 'accepted'] as const;
const FILLS = ['bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'oh-brand-line-x'] as const;

/** The sales funnel as a real funnel: centred bars narrowing to the accepted quotations. */
export function PipelineTile({
  pipeline,
  className,
}: {
  readonly pipeline: CommandCenter['pipeline'];
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.tiles');
  const stepT = useTranslations('commandCenter.tiles.steps');
  const widest = Math.max(1, pipeline.leads);
  return (
    <section className={cn(TILE, 'flex flex-col gap-5', className)}>
      <p className="type-overline text-ink-faint uppercase">{t('pipeline')}</p>
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
            <span className="truncate">{stepT(step)}</span>
            <span className="font-mono font-medium">{pipeline[step]}</span>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
