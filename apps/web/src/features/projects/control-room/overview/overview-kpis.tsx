'use client';

import { KpiTile } from '@oneohm/design-system/web';
import { WAITING_PARTIES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import type { ProjectSignals } from '../room-signals';

/**
 * Four numbers that say how the work stands: open, late, held by others, finished. Each
 * opens those tasks in the cross-project task list, narrowed to this project.
 */
export function OverviewKpis({
  signals,
  projectId,
}: {
  readonly signals: ProjectSignals;
  readonly projectId: string;
}) {
  const t = useTranslations('projects.overview.kpi');
  const tasks = (show: string) => `/command-center/tasks?show=${show}&project=${projectId}`;
  const partyT = useTranslations('commandCenter.party');
  const unassigned = signals.open.filter((task) => task.assignee === null).length;
  const parties = WAITING_PARTIES.map((party) => ({
    party,
    count: signals.waitingOnOthers.filter((task) => task.waitingParty === party).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        label={t('open')}
        value={signals.open.length}
        goodDirection="none"
        detail={unassigned > 0 ? t('openUnassigned', { count: unassigned }) : t('openOwned')}
        href={tasks('open')}
        hrefLabel={t('openLink', { label: t('open') })}
      />
      <KpiTile
        label={t('overdue')}
        value={signals.overdue.length}
        goodDirection="down"
        detail={signals.overdue.length > 0 ? t('overdueSome') : t('overdueNone')}
        href={tasks('overdue')}
        hrefLabel={t('openLink', { label: t('overdue') })}
      />
      <KpiTile
        label={t('waiting')}
        value={signals.waitingOnOthers.length}
        goodDirection="down"
        detail={
          parties.length > 0
            ? parties
                .map(({ party, count }) => t('waitingParty', { party: partyT(party), count }))
                .join(' · ')
            : t('waitingNone')
        }
        href={tasks('waiting')}
        hrefLabel={t('openLink', { label: t('waiting') })}
      />
      <KpiTile
        label={t('done')}
        value={signals.done}
        detail={t('doneOf', { total: signals.total })}
        href={tasks('done')}
        hrefLabel={t('openLink', { label: t('done') })}
      />
    </div>
  );
}
