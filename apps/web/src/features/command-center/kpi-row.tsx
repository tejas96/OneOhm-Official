'use client';

import { KpiTile, Sparkline } from '@oneohm/design-system/web';
import { FileText, HardHat, SolarPanel, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PREVIEW } from './preview-data';

/** Four numbers an EPC owner checks every morning; each opens the records behind it. */
export function KpiRow() {
  const t = useTranslations('commandCenter.kpis');
  const { kpis } = PREVIEW;
  return (
    <section
      aria-label={t('label')}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiTile
        label={t('activeProjects')}
        icon={<SolarPanel />}
        value={kpis.activeProjects.value}
        previousValue={kpis.activeProjects.previous}
        goodDirection="none"
        href="#projects"
        detail={t('activeProjectsDetail', {
          atRisk: kpis.activeProjects.atRisk,
          discom: kpis.activeProjects.waitingOnDiscom,
        })}
      />
      <KpiTile
        label={t('openLeads')}
        icon={<Target />}
        value={kpis.openLeads.value}
        previousValue={kpis.openLeads.previous}
        href="#pipeline"
        chart={<Sparkline values={kpis.openLeads.trend} label={t('leadsTrend')} />}
        detail={t('openLeadsDetail', { count: kpis.openLeads.followUpToday })}
      />
      <KpiTile
        label={t('quotations')}
        icon={<FileText />}
        value={kpis.quotations.value}
        previousValue={kpis.quotations.previous}
        href="#pipeline"
        detail={t('quotationsDetail', { percent: kpis.quotations.acceptedPercent })}
      />
      <KpiTile
        label={t('crew')}
        icon={<HardHat />}
        value={kpis.crew.onSite}
        goodDirection="none"
        detail={t('crewDetail', { available: kpis.crew.available, onLeave: kpis.crew.onLeave })}
        chart={<CrewDots onSite={kpis.crew.onSite} available={kpis.crew.available} />}
      />
    </section>
  );
}

/** One dot per available person: filled when on site today. */
function CrewDots({ onSite, available }: { readonly onSite: number; readonly available: number }) {
  return (
    <span aria-hidden className="flex flex-wrap gap-1">
      {Array.from({ length: available }, (_, index) => (
        <span
          key={index}
          className={
            index < onSite ? 'size-2 rounded-full bg-accent' : 'size-2 rounded-full bg-rule'
          }
        />
      ))}
    </span>
  );
}
