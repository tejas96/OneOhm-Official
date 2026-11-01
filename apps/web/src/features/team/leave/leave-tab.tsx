'use client';

import { Button } from '@oneohm/design-system/web';
import { CalendarPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { ApplyLeaveSheet } from './apply-leave-sheet';
import { LeaveBalances } from './leave-balances';
import { LeaveHistory } from './leave-history';
import { LeaveQueue } from './leave-queue';
import { MyLeave } from './my-leave';
import { useAllLeave, useMyLeave, useMyWorkday } from './use-leave';

/** Decisions waiting, everyone's leave, and the signed-in person's own balances and requests. */
export function LeaveTab() {
  const t = useTranslations('team.leave');
  const canApprove = useCan('leave.approve');
  const canRequest = useCan('leave.request');
  const canMark = useCan('attendance.mark');
  const all = useAllLeave(canApprove);
  const mine = useMyLeave(canRequest);
  const workday = useMyWorkday(canRequest && canMark);
  const [applying, setApplying] = useState(false);
  const kinds = workday.data?.balances ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        {canRequest && (
          <Button
            variant="primary"
            leadingIcon={<CalendarPlus />}
            onClick={() => setApplying(true)}
            disabled={kinds.length === 0}
            className="self-start sm:self-auto"
          >
            {t('applyAction')}
          </Button>
        )}
      </div>
      {/* Phones read the queue, then your own leave, then everyone's; wide screens keep yours beside both. */}
      <div className="grid grid-cols-1 items-start gap-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[auto_1fr]">
        {canApprove && (
          <div className="flex min-w-0 flex-col gap-10 xl:col-start-1 xl:row-start-1">
            {all.isPending && <ListSkeleton label={t('loading')} rows={3} />}
            {all.isError && <LoadError error={all.error} onRetry={() => all.refetch()} />}
            {all.data && <LeaveQueue requests={all.data} />}
          </div>
        )}
        {canRequest && (
          <aside
            aria-label={t('mine.title')}
            className={
              canApprove
                ? 'flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-span-2 xl:row-start-1'
                : 'flex min-w-0 flex-col gap-5 xl:col-span-2'
            }
          >
            <div className="flex flex-col gap-0.5">
              <h2 className="type-title-lg text-ink">{t('mine.title')}</h2>
              <p className="type-body-sm text-ink-faint">{t('mine.description')}</p>
            </div>
            {workday.data && <LeaveBalances balances={workday.data.balances} />}
            {mine.isPending && <ListSkeleton label={t('loading')} rows={2} />}
            {mine.isError && <LoadError error={mine.error} onRetry={() => mine.refetch()} />}
            {mine.data && <MyLeave requests={mine.data} />}
          </aside>
        )}
        {canApprove && all.data && (
          <div className="min-w-0 xl:col-start-1 xl:row-start-2">
            <LeaveHistory requests={all.data} />
          </div>
        )}
      </div>
      {canRequest && <ApplyLeaveSheet open={applying} onOpenChange={setApplying} kinds={kinds} />}
    </div>
  );
}
