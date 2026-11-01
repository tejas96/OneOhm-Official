'use client';

import type { CommandCenter, CommandCenterQuery } from '@oneohm/api-contracts';
import { cn, DonutChart } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { centerHref } from './center-links';

/** A side panel on the command centre: hairline paper, like the other cards. */
export const TILE = 'rounded-xl border border-hairline bg-raised p-5';

export function Overline({
  children,
  light = false,
}: {
  readonly children: ReactNode;
  readonly light?: boolean;
}) {
  return (
    <p className={cn('type-overline uppercase', light ? 'text-on-panel-muted' : 'text-ink-faint')}>
      {children}
    </p>
  );
}

const PARTIES = ['discom', 'internal', 'customer', 'bank'] as const;
const PARTY_STROKE = {
  internal: 'stroke-party-internal',
  customer: 'stroke-party-customer',
  bank: 'stroke-party-bank',
  discom: 'stroke-party-discom',
} as const;
const PARTY_FILL = {
  internal: 'bg-party-internal',
  customer: 'bg-party-customer',
  bank: 'bg-party-bank',
  discom: 'bg-party-discom',
} as const;

/**
 * Waiting days by who the projects waited on. The title opens the delays report; each
 * party opens the tasks that waited on it.
 */
export function WaitingTile({
  days,
  query,
  className,
}: {
  readonly days: CommandCenter['waitingDays'];
  readonly query: CommandCenterQuery;
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.tiles');
  const partyT = useTranslations('commandCenter.party');
  const total = PARTIES.reduce((sum, party) => sum + days[party], 0);
  return (
    <section id="waiting" className={cn(TILE, 'flex scroll-mt-24 flex-col gap-5', className)}>
      <Link href={centerHref('/reports/delays', query)} className="self-start hover:underline">
        <Overline>{t('waiting')}</Overline>
      </Link>
      <div className="flex items-center gap-5">
        <DonutChart
          size={112}
          thickness={12}
          label={t('waitingAria', { total })}
          segments={PARTIES.map((party) => ({
            key: party,
            value: days[party],
            strokeClassName: PARTY_STROKE[party],
          }))}
        >
          <span className="type-display-md text-ink tabular-nums">{total}</span>
          <span className="mt-1 type-label text-ink-faint">{t('days')}</span>
        </DonutChart>
        <ul className="flex flex-1 flex-col gap-2">
          {PARTIES.map((party) => (
            <li key={party}>
              <Link
                href={centerHref('/command-center/tasks', query, { show: 'waiting', party })}
                className="-mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 type-body-sm hover:bg-sunken/60"
              >
                <span className="inline-flex items-center gap-2 text-ink-muted">
                  <span aria-hidden className={cn('size-2.5 rounded-[3px]', PARTY_FILL[party])} />
                  {partyT(party)}
                </span>
                <span className="font-mono text-ink">{days[party]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
