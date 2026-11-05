'use client';

import { EmptyState } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { UsersRound } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useFocusRow } from '@/lib/use-focus-row';
import { useCan, useCurrentUser } from '@/providers/current-user';
import {
  AttendanceKpis,
  AttendanceShowChip,
  attendanceShown,
  useAttendanceShow,
} from './attendance-kpis';
import { AttendanceTable } from './attendance-table';
import { CorrectionsQueue } from './corrections-queue';
import { DayPicker } from './day-picker';
import { usePendingCorrections, useTeamAttendance } from './use-attendance';

/** Who came in on a day, when and where; corrections waiting for a decision come first. */
export function AttendanceTab() {
  const t = useTranslations('team.attendance');
  const canDecide = useCan('leave.approve');
  const me = useCurrentUser();
  const today = todayIn();
  // A tile link (`?date=…&show=late`) reopens the same day with that group listed.
  const linked = useSearchParams().get('date');
  const [date, setDate] = useState(linked && /^\d{4}-\d{2}-\d{2}$/.test(linked) ? linked : today);
  const show = useAttendanceShow();
  const rows = useTeamAttendance(date);
  const corrections = usePendingCorrections(canDecide);
  // Nobody decides their own correction; those wait for someone else.
  const waiting = (corrections.data ?? []).filter((item) => item.user.id !== me.id);
  // `?correction=<id>` (an approval's or alert's "Open") marks one waiting correction.
  const focused = useFocusRow('correction', corrections.data && waiting);

  return (
    <div className="flex flex-col gap-8">
      {corrections.isError && (
        <LoadError error={corrections.error} onRetry={() => corrections.refetch()} />
      )}
      {waiting.length > 0 && <CorrectionsQueue items={waiting} focused={focused} />}
      <DayPicker date={date} today={today} onChange={setDate} />
      {rows.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {rows.isError && <LoadError error={rows.error} onRetry={() => rows.refetch()} />}
      {rows.data && rows.data.length === 0 && (
        <EmptyState icon={<UsersRound />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {rows.data && rows.data.length > 0 && (
        <>
          <AttendanceKpis rows={rows.data} date={date} />
          <AttendanceShowChip />
          <AttendanceTable rows={attendanceShown(rows.data, show)} />
        </>
      )}
      {canDecide && corrections.data && waiting.length === 0 && (
        <p className="type-body-sm text-ink-faint">{t('corrections.none')}</p>
      )}
    </div>
  );
}
