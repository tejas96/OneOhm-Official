'use client';

import type { CommandCenter, CommandCenterQuery } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { centerHref } from './center-links';
import { Overline, TILE } from './waiting-tile';

const WINDOWS = [
  { key: 'thisMonth', finish: 'this_month' },
  { key: 'nextMonth', finish: 'next_month' },
  { key: 'later', finish: 'later' },
] as const;

/**
 * Delivery forecast for the portfolio: live projects by the month they are expected to
 * finish, and how many run behind plan. The rule is written under the numbers.
 */
export function OutlookTile({
  outlook,
  query,
  className,
}: {
  readonly outlook: CommandCenter['outlook'];
  readonly query: CommandCenterQuery;
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.outlook');
  const row = 'flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-sunken/60';
  return (
    <section className={cn(TILE, 'flex flex-col gap-4', className)}>
      <Overline>{t('title')}</Overline>
      <ul className="flex flex-col">
        {WINDOWS.map((window) => (
          <li key={window.key}>
            <Link href={centerHref('/projects', query, { finish: window.finish })} className={row}>
              <span className="flex-1 type-body-sm text-ink-muted">{t(window.key)}</span>
              <span className="font-mono text-ink tabular-nums">{outlook[window.key]}</span>
              <ChevronRight aria-hidden className="size-4 text-ink-faint" />
            </Link>
          </li>
        ))}
        <li className="mt-1 border-t border-hairline pt-1">
          <Link href={centerHref('/projects', query, { finish: 'behind' })} className={row}>
            <span
              className={cn(
                'flex-1 type-body-sm',
                outlook.behindPlan > 0 ? 'text-at-risk' : 'text-ink-muted',
              )}
            >
              {outlook.behindPlan > 0
                ? t('behind', { days: outlook.averageSlipDays })
                : t('noneBehind')}
            </span>
            <span className="font-mono text-ink tabular-nums">{outlook.behindPlan}</span>
            <ChevronRight aria-hidden className="size-4 text-ink-faint" />
          </Link>
        </li>
      </ul>
      <p className="type-label text-ink-faint">{t('rule')}</p>
    </section>
  );
}
