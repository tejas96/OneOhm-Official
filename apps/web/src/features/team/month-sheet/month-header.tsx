'use client';

import type { MonthSheet } from '@oneohm/api-contracts';
import { Button, IconButton } from '@oneohm/design-system/web';
import { addDays } from '@oneohm/shared';
import { ChevronLeft, ChevronRight, Download, Lock, LockOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMonthFormat } from './month-format';
import { currentMonth, lastDayOf, shiftMonth } from './month-math';

/** The month being looked at, and what can be done with it: export, lock or open again. */
export function MonthHeader({
  month,
  sheet,
  onMonth,
  onLock,
  onUnlock,
}: {
  readonly month: string;
  readonly sheet: MonthSheet | undefined;
  readonly onMonth: (month: string) => void;
  readonly onLock: () => void;
  readonly onUnlock: () => void;
}) {
  const t = useTranslations('team.monthSheet.header');
  const words = useMonthFormat();
  const locked = sheet?.status === 'locked';
  const mayLock = sheet?.canManage && !locked;
  const blocked = mayLock && !sheet.lockable;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex gap-1">
            <IconButton
              variant="secondary"
              size="sm"
              label={t('previous')}
              onClick={() => onMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft aria-hidden />
            </IconButton>
            <IconButton
              variant="secondary"
              size="sm"
              label={t('next')}
              disabled={month >= currentMonth()}
              onClick={() => onMonth(shiftMonth(month, 1))}
            >
              <ChevronRight aria-hidden />
            </IconButton>
          </span>
          <h2 className="px-1 type-title-lg text-ink [font-family:var(--font-display)]">
            {words.month(month)}
          </h2>
          {month !== currentMonth() && (
            <Button variant="quiet" size="sm" onClick={() => onMonth(currentMonth())}>
              {t('thisMonth')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <a
              href={`/api/v1/month-sheet/export?month=${month}&format=csv`}
              download
              aria-label={t('exportLabel', { month: words.month(month) })}
            >
              <Download aria-hidden className="size-4" />
              {t('export')}
            </a>
          </Button>
          {mayLock && (
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Lock />}
              disabled={!sheet.lockable}
              onClick={onLock}
            >
              {t('lock')}
            </Button>
          )}
          {locked && sheet?.canManage && (
            <Button variant="secondary" size="sm" leadingIcon={<LockOpen />} onClick={onUnlock}>
              {t('unlock')}
            </Button>
          )}
        </div>
      </div>
      {blocked && (
        <p className="type-body-sm text-ink-faint">
          {t('notYet', {
            month: words.monthName(month),
            date: words.shortDay(addDays(lastDayOf(month), 1)),
          })}
        </p>
      )}
    </div>
  );
}
