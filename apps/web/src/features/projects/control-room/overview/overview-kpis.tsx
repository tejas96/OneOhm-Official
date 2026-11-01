'use client';

import { KpiTile } from '@oneohm/design-system/web';
import { WAITING_PARTIES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import type { ProjectSignals } from '../room-signals';

/** Four numbers that say how the work stands: open, late, held by others, finished. */
export function OverviewKpis({ signals }: { readonly signals: ProjectSignals }) {
  const t = useTranslations('projects.overview.kpi');
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
      />
      <KpiTile
        label={t('overdue')}
        value={signals.overdue.length}
        goodDirection="down"
        detail={signals.overdue.length > 0 ? t('overdueSome') : t('overdueNone')}
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
      />
      <KpiTile
        label={t('done')}
        value={signals.done}
        detail={t('doneOf', { total: signals.total })}
      />
    </div>
  );
}
