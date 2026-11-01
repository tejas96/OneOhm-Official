'use client';

import type { ContractorSummary } from '@oneohm/api-contracts';
import { Badge, cn, listItemEnter, ProgressRing } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { HardHat, MapPin, Phone, Star } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatPhone } from '@/lib/format/contact';

/** One contractor as a calm tile: crew, delivery, quality and money owed at a glance. */
export function ContractorCard({
  contractor,
  index,
}: {
  readonly contractor: ContractorSummary;
  readonly index: number;
}) {
  const t = useTranslations('contractors');
  const { performance } = contractor;
  const onTime = performance.onTimePercent;
  return (
    <motion.li {...listItemEnter(index)} className="list-none">
      <Link
        href={`/contractors/${contractor.id}`}
        className={cn(
          'group flex h-full flex-col gap-5 rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70',
          'transition-shadow duration-(--duration-fast) hover:shadow-e3',
          !contractor.active && 'opacity-60',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="flex items-center gap-2 font-mono text-[0.75rem] text-ink-faint">
              <HardHat aria-hidden className="size-3.5" />
              {t('crewCount', { count: contractor.memberCount })}
              {!contractor.active && <Badge>{t('archived')}</Badge>}
            </p>
            <h2 className="line-clamp-2 type-title-lg font-normal text-ink [font-family:var(--font-display)] group-hover:text-accent">
              {contractor.name}
            </h2>
            {(contractor.contactName || contractor.phone) && (
              <p className="flex flex-col gap-0.5 type-body-sm text-ink-muted">
                {contractor.contactName && <span>{contractor.contactName}</span>}
                {contractor.phone && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem]">
                    <Phone aria-hidden className="size-3.5 text-ink-faint" />
                    {formatPhone(contractor.phone)}
                  </span>
                )}
              </p>
            )}
          </div>
          <ProgressRing
            value={(onTime ?? 0) / 100}
            label={onTime === null ? t('onTimeNone') : t('onTimeAria', { value: onTime })}
            size={56}
            thickness={5}
            paint="brand"
            trackClassName="stroke-sunken"
          >
            <span className="font-mono text-[0.75rem] text-ink">
              {onTime === null ? '—' : `${onTime}%`}
            </span>
          </ProgressRing>
        </div>
        <p className="flex items-center gap-1.5 type-label text-ink-faint">
          <Star aria-hidden className="size-3.5" />
          {performance.rating
            ? `${t('figures.ratingValue', { value: performance.rating })} · ${t('figures.ratingCount', { count: performance.ratings ?? 0 })}`
            : t('figures.ratingTooFew', { count: performance.ratings ?? 0 })}
        </p>
        {contractor.serviceAreas.length > 0 && (
          <p className="flex items-center gap-1.5 type-label text-ink-faint">
            <MapPin aria-hidden className="size-3.5" />
            {contractor.serviceAreas.join(' · ')}
          </p>
        )}
        <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-hairline pt-4">
          <Figure label={t('figures.openWork')} value={String(performance.openWorkOrders)} />
          <Figure
            label={t('figures.rework')}
            value={String(performance.reworkCount)}
            warn={performance.reworkCount > 0}
          />
          <Figure
            label={t('figures.pending')}
            value={formatInrCompact(performance.pendingPayablePaise)}
          />
        </dl>
      </Link>
    </motion.li>
  );
}

function Figure({
  label,
  value,
  warn = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly warn?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-label text-ink-faint">{label}</dt>
      <dd className={cn('type-title-md tabular-nums', warn ? 'text-at-risk' : 'text-ink')}>
        {value}
      </dd>
    </div>
  );
}
