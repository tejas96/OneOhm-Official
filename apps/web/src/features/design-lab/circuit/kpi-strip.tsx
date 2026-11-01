'use client';

import { Card, Sparkline, useCountUp } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PREVIEW } from '../../command-center/preview-data';

/** Sales and crew numbers in one quiet strip: no boxes inside, only hairlines. */
export function KpiStrip() {
  const t = useTranslations('lab.strip');
  const { kpis, pipeline } = PREVIEW;
  const conversion = Math.round((pipeline.accepted / pipeline.leads) * 100);
  return (
    <Card>
      <dl className="grid divide-hairline sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
        <Cell
          label={t('leads')}
          value={kpis.openLeads.value}
          note={t('leadsNote', { count: kpis.openLeads.followUpToday })}
        >
          <Sparkline values={kpis.openLeads.trend} label={t('leadsTrend')} className="h-8" />
        </Cell>
        <Cell
          label={t('quotations')}
          value={kpis.quotations.value}
          note={t('quotationsNote', { percent: kpis.quotations.acceptedPercent })}
        />
        <Cell
          label={t('conversion')}
          value={conversion}
          suffix="%"
          note={t('conversionNote', { accepted: pipeline.accepted, leads: pipeline.leads })}
        />
        <Cell
          label={t('crew')}
          value={kpis.crew.onSite}
          suffix={`/${kpis.crew.available}`}
          note={t('crewNote', { count: kpis.crew.onLeave })}
        />
      </dl>
    </Card>
  );
}

function Cell({
  label,
  value,
  suffix,
  note,
  children,
}: {
  readonly label: string;
  readonly value: number;
  readonly suffix?: string;
  readonly note: string;
  readonly children?: ReactNode;
}) {
  const shown = useCountUp(value);
  return (
    <div className="flex flex-col gap-2 border-hairline p-5 not-first:border-t sm:not-first:border-t-0">
      <dt className="type-body-sm text-ink-muted">{label}</dt>
      <dd className="flex items-end justify-between gap-4">
        <span className="type-display-lg text-ink tabular-nums">
          {Math.round(shown)}
          {suffix && <span className="ml-0.5 type-title-lg text-ink-faint">{suffix}</span>}
        </span>
        {children && <span className="w-28">{children}</span>}
      </dd>
      <p className="type-body-sm text-ink-faint">{note}</p>
    </div>
  );
}
