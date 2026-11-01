'use client';

import type { CommandCenter } from '@oneohm/api-contracts';
import { KpiTile, Sparkline } from '@oneohm/design-system/web';
import { formatInrCompact, formatKwp } from '@oneohm/shared';
import {
  AlarmClock,
  BadgeCheck,
  Banknote,
  FolderKanban,
  Landmark,
  SunMedium,
  TriangleAlert,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Eight live numbers, two rows of four; each opens the records behind it. */
export function CenterKpis({ data }: { readonly data: CommandCenter }) {
  const t = useTranslations('commandCenter.kpis');
  const tiles = useTranslations('commandCenter.tiles');
  const { kpis, installed, collections, money } = data;
  const open = (label: string) => t('open', { label: label.toLowerCase() });
  const rupees = (paise: number) => formatInrCompact(paise);
  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('liveProjects')}
        value={kpis.liveProjects}
        icon={<FolderKanban />}
        goodDirection="none"
        href="/projects"
        hrefLabel={open(t('liveProjects'))}
      />
      <KpiTile
        label={t('needingAttention')}
        value={kpis.needingAttention}
        icon={<TriangleAlert />}
        goodDirection="down"
        detail={t('needingDetail')}
        href="/projects"
        hrefLabel={open(t('needingAttention'))}
      />
      <KpiTile
        label={t('overdueTasks')}
        value={kpis.overdueTasks}
        icon={<AlarmClock />}
        goodDirection="down"
        detail={t('ofOpen', { open: kpis.openTasks })}
        href="/projects"
        hrefLabel={open(t('overdueTasks'))}
      />
      <KpiTile
        label={t('unassigned')}
        value={kpis.unassignedTasks}
        icon={<UserX />}
        goodDirection="down"
        href="/projects"
        hrefLabel={open(t('unassigned'))}
      />
      <KpiTile
        label={t('installed')}
        value={installed.wattsPeak}
        format={formatKwp}
        icon={<SunMedium />}
        detail={t('installedDetail', {
          count: installed.commissioned,
          next: installed.dueThisWeek,
        })}
        href="/projects"
        hrefLabel={open(t('installed'))}
      />
      <KpiTile
        label={t('collected')}
        value={collections.collectedPaise}
        format={rupees}
        icon={<Banknote />}
        detail={t('collectedDetail', { due: rupees(collections.duePaise) })}
        chart={<Sparkline values={collections.weekly} label={tiles('weeklyAria')} area />}
        href="/finance?tab=receivables"
        hrefLabel={open(t('collected'))}
      />
      <KpiTile
        label={t('stillDue')}
        value={money.stillDuePaise}
        format={rupees}
        icon={<Landmark />}
        goodDirection="down"
        detail={`${t('bankPending')}: ${rupees(money.bankPendingPaise)}`}
        href="/finance?tab=receivables"
        hrefLabel={open(t('stillDue'))}
      />
      <KpiTile
        label={t('accepted')}
        value={kpis.quotationsAccepted}
        icon={<BadgeCheck />}
        detail={t('acceptedDetail', { sent: kpis.quotationsSent })}
        href="/quotations"
        hrefLabel={open(t('accepted'))}
      />
    </section>
  );
}
