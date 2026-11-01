'use client';

import type { AmcContract, CustomerAftercare, InstalledAsset } from '@oneohm/api-contracts';
import { Card, CardHeader, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

const COVER_TONE: Readonly<Record<InstalledAsset['warrantyState'], PillTone>> = {
  active: 'onTrack',
  ending_soon: 'atRisk',
  ended: 'neutral',
};

const AMC_TONE: Readonly<Record<AmcContract['state'], PillTone>> = {
  upcoming: 'waiting',
  active: 'onTrack',
  ended: 'neutral',
  cancelled: 'neutral',
};

const LONG_DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;

/** Warranty and AMC on each project, read-only; changes are made on the project (PRD 3.2). */
export function CustomerAftercareCard({
  aftercare,
}: {
  readonly aftercare: readonly CustomerAftercare[];
}) {
  const t = useTranslations('customers.service');
  return (
    <Card className="min-w-0">
      <CardHeader title={t('aftercareTitle')} description={t('aftercareBody')} />
      {aftercare.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">
          {t('aftercareNone')}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {aftercare.map((item) => (
            <ProjectCover key={item.project.id} item={item} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ProjectCover({ item }: { readonly item: CustomerAftercare }) {
  const t = useTranslations('customers.service');
  return (
    <section aria-label={item.project.code} className="flex flex-col gap-3 px-5 py-4">
      <Link
        href={`/projects/${item.project.id}`}
        className="inline-flex items-center gap-1 self-start font-mono text-[0.8125rem] text-ink hover:text-accent"
      >
        {item.project.code}
        <ArrowUpRight aria-hidden className="size-3.5" />
      </Link>
      {item.assets.length === 0 ? (
        <p className="type-body-sm text-ink-faint">{t('notRecorded')}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="type-overline text-ink-faint uppercase">{t('installed')}</p>
          <ul className="flex flex-col divide-y divide-hairline">
            {item.assets.map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="type-overline text-ink-faint uppercase">{t('amc')}</p>
        {item.amcs.length === 0 ? (
          <p className="type-body-sm text-ink-faint">{t('noAmc')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {item.amcs.map((contract) => (
              <AmcRow key={contract.id} contract={contract} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AssetRow({ asset }: { readonly asset: InstalledAsset }) {
  const t = useTranslations('afterSales.project');
  const format = useFormatter();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2">
      <p className="min-w-0 type-body-sm text-ink">
        <span className="font-medium">{t(`kinds.${asset.kind}`)}</span>
        {asset.quantity > 1 && (
          <span className="ml-1.5 font-mono text-ink-muted tabular-nums">
            {t('quantity', { count: asset.quantity })}
          </span>
        )}
        <span className="ml-1.5 text-ink-muted">
          {[asset.make, asset.model].filter(Boolean).join(' · ')}
        </span>
      </p>
      <span className="flex items-center gap-2">
        <span className="whitespace-nowrap type-label text-ink-muted tabular-nums">
          {t('until', { date: format.dateTime(new Date(asset.warrantyEndsOn), LONG_DATE) })}
        </span>
        <StatusPill
          size="sm"
          tone={COVER_TONE[asset.warrantyState]}
          label={t(`state.${asset.warrantyState}`)}
        />
      </span>
    </li>
  );
}

function AmcRow({ contract }: { readonly contract: AmcContract }) {
  const t = useTranslations('customers.service');
  const labels = useTranslations('afterSales.project');
  const format = useFormatter();
  const day = (value: string) => format.dateTime(new Date(value), LONG_DATE);
  const done = contract.visits.filter((visit) => visit.request?.status === 'resolved').length;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-body-sm font-medium text-ink">{contract.planName}</span>
        <span className="type-label text-ink-muted tabular-nums">
          {t('amcPeriod', { from: day(contract.startsOn), to: day(contract.endsOn) })} ·{' '}
          {labels('visits', { done, total: contract.visits.length })}
        </span>
      </div>
      <StatusPill
        size="sm"
        tone={AMC_TONE[contract.state]}
        label={labels(`amcState.${contract.state}`)}
      />
    </li>
  );
}
