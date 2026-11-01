'use client';

import type { VendorScorecard } from '@oneohm/api-contracts';
import { KpiTile } from '@oneohm/design-system/web';
import { formatInr, formatInrCompact } from '@oneohm/shared';
import { CalendarCheck, HandCoins, PackageSearch, ShoppingCart, Timer, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

const none = () => '—';

/** The vendor's record in six numbers; each opens the tab with the records behind it. */
export function VendorKpis({ scorecard }: { readonly scorecard: VendorScorecard }) {
  const t = useTranslations('purchasing.profile.kpis');
  const judged = scorecard.onTime + scorecard.late + scorecard.openLate;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <KpiTile
        label={t('ordered')}
        icon={<ShoppingCart />}
        value={scorecard.orderedPaise}
        format={formatInrCompact}
        goodDirection="none"
        detail={t('orderedDetail', { count: scorecard.orders })}
        href="?tab=orders"
        hrefLabel={t('openTab', { label: t('ordered') })}
      />
      <KpiTile
        label={t('onTime')}
        icon={<CalendarCheck />}
        value={(scorecard.onTimeBp ?? 0) / 100}
        format={scorecard.onTimeBp === null ? none : (value) => `${Math.round(value)}%`}
        detail={
          judged === 0
            ? t('onTimeNone')
            : t('onTimeDetail', {
                onTime: scorecard.onTime,
                late: scorecard.late,
                open: scorecard.openLate,
              })
        }
        href="?tab=orders"
        hrefLabel={t('openTab', { label: t('onTime') })}
      />
      <KpiTile
        label={t('days')}
        icon={<Timer />}
        value={scorecard.averageDaysToDeliver ?? 0}
        format={
          scorecard.averageDaysToDeliver === null
            ? none
            : (value) => t('daysValue', { days: Math.round(value * 10) / 10 })
        }
        goodDirection="down"
        detail={t('daysDetail', { count: scorecard.delivered })}
        href="?tab=orders"
        hrefLabel={t('openTab', { label: t('days') })}
      />
      <KpiTile
        label={t('inspection')}
        icon={<PackageSearch />}
        value={scorecard.inspectionFailures}
        goodDirection="down"
        detail={t('inspectionDetail', { count: scorecard.receipts })}
        href="?tab=inspection"
        hrefLabel={t('openTab', { label: t('inspection') })}
      />
      <KpiTile
        label={t('outstanding')}
        icon={<Wallet />}
        value={scorecard.outstandingPaise}
        format={formatInrCompact}
        goodDirection="down"
        detail={
          scorecard.overduePaise > 0
            ? t('overdue', { amount: formatInr(scorecard.overduePaise) })
            : t('nothingOverdue')
        }
        href="?tab=bills"
        hrefLabel={t('openTab', { label: t('outstanding') })}
      />
      <KpiTile
        label={t('advances')}
        icon={<HandCoins />}
        value={scorecard.openAdvancesPaise}
        format={formatInrCompact}
        goodDirection="none"
        detail={t('advancesDetail')}
        href="?tab=advances"
        hrefLabel={t('openTab', { label: t('advances') })}
      />
    </div>
  );
}
