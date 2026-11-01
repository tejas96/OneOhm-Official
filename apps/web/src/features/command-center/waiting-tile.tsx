'use client';

import type { CommandCenter } from '@oneohm/api-contracts';
import { cn, DonutChart } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

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

/** Waiting days by who the projects waited on. */
export function WaitingTile({
  days,
  className,
}: {
  readonly days: CommandCenter['waitingDays'];
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.tiles');
  const partyT = useTranslations('commandCenter.party');
  const total = PARTIES.reduce((sum, party) => sum + days[party], 0);
  return (
    <section id="waiting" className={cn(TILE, 'flex scroll-mt-24 flex-col gap-5', className)}>
      <Overline>{t('waiting')}</Overline>
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
            <li key={party} className="flex items-center justify-between gap-2 type-body-sm">
              <span className="inline-flex items-center gap-2 text-ink-muted">
                <span aria-hidden className={cn('size-2.5 rounded-[3px]', PARTY_FILL[party])} />
                {partyT(party)}
              </span>
              <span className="font-mono text-ink">{days[party]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
