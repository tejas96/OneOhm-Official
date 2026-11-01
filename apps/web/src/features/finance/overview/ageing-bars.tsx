'use client';

import type { FinanceOverview } from '@oneohm/api-contracts';
import { easing, seconds } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

const BUCKETS = ['current', 'days_31_60', 'days_61_90', 'days_over_90'] as const;

/**
 * Money owed by how long it has been due: one series, so one hue and no legend;
 * every bar carries its value as text, so the list doubles as its own table.
 */
export function AgeingBars({
  ageing,
}: {
  readonly ageing: FinanceOverview['receivables']['ageing'];
}) {
  const t = useTranslations('finance.overview.ageing');
  const max = Math.max(1, ...BUCKETS.map((bucket) => ageing[bucket]));
  return (
    <dl className="flex flex-col gap-4">
      {BUCKETS.map((bucket, index) => (
        <div key={bucket} className="grid grid-cols-[7rem_1fr] items-center gap-3">
          <dt className="type-body-sm text-ink-muted">{t(bucket)}</dt>
          <dd className="flex items-center gap-3">
            <span className="h-3 flex-1">
              <motion.span
                className="block h-full origin-left rounded-r-[4px] bg-accent"
                style={{
                  width: `${Math.max(ageing[bucket] > 0 ? 2 : 0, (ageing[bucket] / max) * 100)}%`,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: seconds('data'),
                  ease: easing('outExpo'),
                  delay: index * 0.05,
                }}
              />
            </span>
            <span className="w-24 text-right font-mono type-body-sm text-ink tabular-nums">
              {formatInr(ageing[bucket])}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
