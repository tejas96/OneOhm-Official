'use client';

import type { CommandCenter, CommandCenterQuery } from '@oneohm/api-contracts';
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
import { centerHref } from './center-links';

/**
 * Eight live numbers, two rows of four; each opens the records behind it with the
 * command centre's period, manager and type carried along.
 */
export function CenterKpis({
  data,
  query,
}: {
  readonly data: CommandCenter;
  readonly query: CommandCenterQuery;
}) {
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
        href={centerHref('/projects', query)}
        hrefLabel={open(t('liveProjects'))}
      />
      <KpiTile
        label={t('needingAttention')}
        value={kpis.needingAttention}
        icon={<TriangleAlert />}
        goodDirection="down"
        detail={t('needingDetail')}
        href={centerHref('/projects', query, { health: 'attention', sort: 'attention' })}
        hrefLabel={open(t('needingAttention'))}
      />
      <KpiTile
        label={t('overdueTasks')}
        value={kpis.overdueTasks}
        icon={<AlarmClock />}
        goodDirection="down"
        detail={t('ofOpen', { open: kpis.openTasks })}
        href={centerHref('/command-center/tasks', query, { show: 'overdue' })}
        hrefLabel={open(t('overdueTasks'))}
      />
      <KpiTile
        label={t('unassigned')}
        value={kpis.unassignedTasks}
        icon={<UserX />}
        goodDirection="down"
        href={centerHref('/command-center/tasks', query, { show: 'unassigned' })}
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
        href={centerHref('/reports/delivery', query)}
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
        href={centerHref('/reports/sales', query)}
        hrefLabel={open(t('accepted'))}
      />
    </section>
  );
}
