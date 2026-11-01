'use client';

import type { TeamAttendanceRow } from '@oneohm/api-contracts';
import { KpiTile } from '@oneohm/design-system/web';
import { CalendarOff, Clock, UserCheck, UserX, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const SHOWS = ['present', 'late', 'onLeave', 'notIn'] as const;
type Show = (typeof SHOWS)[number];

const MATCH: Readonly<Record<Show, (row: TeamAttendanceRow) => boolean>> = {
  present: (row) => row.day !== null,
  late: (row) => Boolean(row.day?.late),
  onLeave: (row) => row.onLeave !== null,
  notIn: (row) => row.day === null && row.onLeave === null,
};

/** The group a tile opened (`?show=late`), or null for everyone. */
export function useAttendanceShow(): Show | null {
  const value = useSearchParams().get('show');
  return SHOWS.find((show) => show === value) ?? null;
}

/** The people in the group a tile opened; everyone when none is chosen. */
export const attendanceShown = (rows: readonly TeamAttendanceRow[], show: Show | null) =>
  show ? rows.filter(MATCH[show]) : rows;

/** Present, late, away and not yet in, for the chosen day; each tile lists those people. */
export function AttendanceKpis({
  rows,
  date,
}: {
  readonly rows: readonly TeamAttendanceRow[];
  readonly date: string;
}) {
  const t = useTranslations('team.attendance.kpis');
  const count = (show: Show) => rows.filter(MATCH[show]).length;
  const href = (show: Show) => `?tab=attendance&date=${date}&show=${show}`;
  return (
    <section aria-label={t('label')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label={t('present')}
        value={count('present')}
        icon={<UserCheck />}
        goodDirection="none"
        detail={t('ofTeam', { count: rows.length })}
        href={href('present')}
        hrefLabel={t('openGroup', { group: t('present') })}
      />
      <KpiTile
        label={t('late')}
        value={count('late')}
        icon={<Clock />}
        goodDirection="none"
        href={href('late')}
        hrefLabel={t('openGroup', { group: t('late') })}
      />
      <KpiTile
        label={t('onLeave')}
        value={count('onLeave')}
        icon={<CalendarOff />}
        goodDirection="none"
        href={href('onLeave')}
        hrefLabel={t('openGroup', { group: t('onLeave') })}
      />
      <KpiTile
        label={t('notIn')}
        value={count('notIn')}
        icon={<UserX />}
        goodDirection="none"
        href={href('notIn')}
        hrefLabel={t('openGroup', { group: t('notIn') })}
      />
    </section>
  );
}

/** "Showing: late" above the table, with a way back to everyone. */
export function AttendanceShowChip() {
  const t = useTranslations('team.attendance.kpis');
  const show = useAttendanceShow();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  if (!show) return null;
  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete('show');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <button
      type="button"
      onClick={clear}
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-hairline bg-raised px-3 py-1 type-body-sm text-ink hover:border-rule"
    >
      {t('showing', { group: t(show) })}
      <X aria-hidden className="size-3.5 text-ink-faint" />
      <span className="sr-only">{t('showEveryone')}</span>
    </button>
  );
}
