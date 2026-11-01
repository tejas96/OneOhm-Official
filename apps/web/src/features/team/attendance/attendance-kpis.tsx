'use client';

import type { TeamAttendanceRow } from '@oneohm/api-contracts';
import { KpiTile } from '@oneohm/design-system/web';
import { CalendarOff, Clock, UserCheck, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Present, late, away and not yet in, for the chosen day. */
export function AttendanceKpis({ rows }: { readonly rows: readonly TeamAttendanceRow[] }) {
  const t = useTranslations('team.attendance.kpis');
  const present = rows.filter((row) => row.day !== null).length;
  const late = rows.filter((row) => row.day?.late).length;
  const onLeave = rows.filter((row) => row.onLeave !== null).length;
  const notIn = rows.filter((row) => row.day === null && row.onLeave === null).length;
  return (
    <section aria-label={t('label')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('present')}
        value={present}
        icon={<UserCheck />}
        goodDirection="none"
        detail={t('ofTeam', { count: rows.length })}
      />
      <KpiTile label={t('late')} value={late} icon={<Clock />} goodDirection="none" />
      <KpiTile label={t('onLeave')} value={onLeave} icon={<CalendarOff />} goodDirection="none" />
      <KpiTile label={t('notIn')} value={notIn} icon={<UserX />} goodDirection="none" />
    </section>
  );
}
