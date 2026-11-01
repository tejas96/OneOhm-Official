'use client';

import { ShareBar, Sparkline, useCountUp } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PREVIEW } from '../../command-center/preview-data';
import { MONEY, STAGE_LOAD } from '../lab-data';

const STAGE_FILLS = [
  'bg-swatch-0',
  'bg-swatch-1',
  'bg-swatch-2',
  'bg-accent',
  'bg-swatch-4',
  'bg-party-discom',
  'bg-swatch-5',
];

/** Four figures set like a newspaper's market table: no boxes, hairlines between. */
export function FiguresRow() {
  const t = useTranslations('lab.editorial.figures');
  const stagesT = useTranslations('stages');
  const collected = useCountUp(MONEY.collected);
  const installed = useCountUp(PREVIEW.pulse.installedWp);
  return (
    <dl className="grid border-y border-hairline sm:grid-cols-2 xl:grid-cols-4">
      <Figure
        index="01"
        label={t('collected')}
        value={formatInrCompact(collected)}
        note={t('collectedNote', { due: formatInrCompact(MONEY.due) })}
      >
        <Sparkline
          values={PREVIEW.money.weeklyCollections}
          label={t('collectedTrend')}
          className="h-9"
        />
      </Figure>
      <Figure
        index="02"
        label={t('installed')}
        value={`${(installed / 1000).toFixed(1)}`}
        unit="kWp"
        note={t('installedNote', { count: PREVIEW.pulse.commissioned })}
      >
        <span aria-hidden className="flex gap-1">
          {Array.from({ length: PREVIEW.pulse.commissioned }, (_, index) => (
            <span key={`system-${index + 1}`} className="h-6 flex-1 rounded-[3px] bg-energy/80" />
          ))}
        </span>
      </Figure>
      <Figure index="03" label={t('projects')} value="24" note={t('projectsNote')}>
        <ShareBar
          legend="none"
          label={t('projectsAria')}
          segments={STAGE_LOAD.map((load, index) => ({
            key: load.stage,
            label: stagesT(load.stage),
            value: load.projects,
            colorClassName: STAGE_FILLS[index] ?? 'bg-accent',
          }))}
        />
      </Figure>
      <Figure
        index="04"
        label={t('leads')}
        value={String(PREVIEW.kpis.openLeads.value)}
        note={t('leadsNote', { count: PREVIEW.kpis.openLeads.followUpToday })}
      >
        <Sparkline
          values={PREVIEW.kpis.openLeads.trend}
          label={t('leadsTrend')}
          className="h-9 text-energy"
        />
      </Figure>
    </dl>
  );
}

function Figure({
  index,
  label,
  value,
  unit,
  note,
  children,
}: {
  readonly index: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly note: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-hairline py-6 not-first:border-t sm:px-6 sm:first:pl-0 sm:not-first:border-t-0 sm:[&:nth-child(n+2)]:border-l xl:last:pr-0">
      <dt className="flex items-baseline gap-2 type-overline text-ink-faint uppercase">
        <span className="font-mono text-accent">{index}</span>
        {label}
      </dt>
      <dd className="type-display-xl text-ink tabular-nums">
        {value}
        {unit && <span className="ml-1.5 type-title-lg text-ink-faint">{unit}</span>}
      </dd>
      <div className="min-h-9">{children}</div>
      <p className="type-body-sm text-ink-faint">{note}</p>
    </div>
  );
}
