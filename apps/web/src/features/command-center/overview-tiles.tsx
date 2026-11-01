'use client';

import type { CommandCenter } from '@oneohm/api-contracts';
import {
  cn,
  DonutChart,
  easing,
  ProgressRing,
  seconds,
  useCountUp,
} from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { RooftopIllustration } from './rooftop/rooftop-illustration';

export const TILE = 'rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70';

function Overline({
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

/** The hero tile: what was installed this month, with the rooftop drawing. */
export function InstalledTile({
  installed: figures,
  className,
}: {
  readonly installed: CommandCenter['installed'];
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.tiles');
  const installed = useCountUp(figures.wattsPeak);
  return (
    <section
      className={cn(
        'relative flex min-h-[26rem] flex-col justify-between overflow-hidden rounded-[28px] p-7 ring-1 ring-hairline/70',
        'bg-[linear-gradient(155deg,var(--color-accent-soft)_0%,var(--color-raised)_55%,var(--color-energy-soft)_100%)]',
        className,
      )}
    >
      <div className="relative z-10 flex flex-col gap-2">
        <Overline>{t('installed')}</Overline>
        <p className="type-hero text-ink tabular-nums">
          {(installed / 1000).toFixed(1)}
          <span className="ml-2 type-display-md text-ink-faint">kWp</span>
        </p>
        <p className="max-w-[15rem] type-body text-ink-muted">
          {t('installedNote', { count: figures.commissioned, next: figures.dueThisWeek })}
        </p>
      </div>
      <ul className="relative z-10 flex flex-wrap gap-2">
        {(['residential', 'society', 'commercial'] as const).map((kind) => (
          <li
            key={kind}
            className="rounded-full bg-raised/80 px-3 py-1.5 type-body-sm text-ink-muted shadow-e1 backdrop-blur"
          >
            <span className="mr-1.5 font-mono text-ink">{figures.byType[kind]}</span>
            {t(`kinds.${kind}`)}
          </li>
        ))}
      </ul>
      <RooftopIllustration className="pointer-events-none absolute -right-6 bottom-0 w-[68%] max-w-[34rem]" />
    </section>
  );
}

/** Collections this month on the ocean panel, with the last eight weeks as bars. */
export function CollectionsTile({
  collections,
  className,
}: {
  readonly collections: CommandCenter['collections'];
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.tiles');
  const values = collections.weekly;
  const max = Math.max(1, ...values);
  return (
    <section className={cn('oh-panel flex flex-col gap-5 rounded-[28px] p-6 shadow-e3', className)}>
      <div className="flex flex-col gap-2">
        <Overline light>{t('collected')}</Overline>
        <p className="type-display-xl text-on-panel tabular-nums">
          {formatInrCompact(collections.collectedPaise)}
        </p>
        <p className="type-body-sm text-on-panel-muted">
          {t('ofDue', { due: formatInrCompact(collections.duePaise) })}
        </p>
      </div>
      <div className="flex h-20 items-end gap-2" role="img" aria-label={t('weeklyAria')}>
        {values.map((value, index) => (
          <motion.span
            key={`week-${index + 1}`}
            className={cn(
              'flex-1 origin-bottom rounded-t-md',
              index === values.length - 1 ? 'oh-brand-line' : 'bg-on-panel/18',
            )}
            style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{
              duration: seconds('data'),
              ease: easing('outExpo'),
              delay: 0.2 + index * 0.04,
            }}
          />
        ))}
      </div>
      <p className="type-label text-on-panel-muted">{t('weeks')}</p>
    </section>
  );
}

const FACTORS = ['delivery', 'money', 'team'] as const;

/** Business health: the score and the three parts it is made of. */
export function HealthTile({
  health,
  className,
}: {
  readonly health: CommandCenter['health'];
  readonly className?: string;
}) {
  const t = useTranslations('commandCenter.tiles');
  return (
    <section className={cn(TILE, 'flex flex-col gap-5', className)}>
      <Overline>{t('health')}</Overline>
      <div className="flex items-center gap-5">
        <ProgressRing
          value={health.score / 100}
          label={t('healthAria', { score: health.score })}
          size={112}
          thickness={10}
          paint="brand"
          trackClassName="stroke-sunken"
        >
          <span className="type-display-lg text-ink tabular-nums">{health.score}</span>
        </ProgressRing>
        <ul className="flex flex-1 flex-col gap-3">
          {FACTORS.map((factor) => (
            <li key={factor} className="flex flex-col gap-1">
              <span className="flex justify-between type-label text-ink-muted">
                {t(`factors.${factor}`)}
                <span className="font-mono text-ink">{health[factor]}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-sunken">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${health[factor]}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
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
