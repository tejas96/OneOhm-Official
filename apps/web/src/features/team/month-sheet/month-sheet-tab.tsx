'use client';

import type { MonthSheetRow } from '@oneohm/api-contracts';
import { Button, EmptyState } from '@oneohm/design-system/web';
import { UsersRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { LockDialog } from './lock-dialog';
import { MonthBanner } from './month-banner';
import { MonthCards } from './month-cards';
import { MonthChips, type MonthFilter } from './month-chips';
import { MonthHeader } from './month-header';
import { monthFromParam } from './month-math';
import { MonthTable } from './month-table';
import { PersonPanel } from './person-panel';
import { UnlockDialog } from './unlock-dialog';
import { useMonthSheet } from './use-month-sheet';

/**
 * The month sheet for salary: one row per person, amber rows first. The month and the open
 * person live in the address (`?tab=month&month=2026-10&person=<id>`), so a link opens exactly
 * what the sender saw.
 */
export function MonthSheetTab() {
  const t = useTranslations('team.monthSheet');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const month = monthFromParam(params.get('month'));
  const personId = params.get('person');
  const query = useMonthSheet(month);
  const [filter, setFilter] = useState<MonthFilter>('all');
  const [dialog, setDialog] = useState<'lock' | 'unlock' | null>(null);

  const go = (patch: Readonly<Record<string, string | null>>) => {
    const next = new URLSearchParams(params);
    next.set('tab', 'month');
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const sheet = query.data;
  const active: MonthFilter =
    (filter === 'check' && (sheet?.summary.amberRows ?? 0) > 0) ||
    (filter === 'changed' && (sheet?.summary.changedRows ?? 0) > 0) ||
    (filter === 'notInLock' && (sheet?.summary.notInLockRows ?? 0) > 0)
      ? filter
      : 'all';
  const keeps: Record<MonthFilter, (row: MonthSheetRow) => boolean> = {
    all: () => true,
    check: (row) => row.amber,
    changed: (row) => row.changes.length > 0,
    notInLock: (row) => !row.inLock,
  };
  const shown = (sheet?.rows ?? []).filter(keeps[active]);

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <p className="max-w-3xl type-body-sm text-ink-faint">{t('description')}</p>
      <MonthHeader
        month={month}
        sheet={sheet}
        onMonth={(next) => go({ month: next, person: null })}
        onLock={() => setDialog('lock')}
        onUnlock={() => setDialog('unlock')}
      />
      {query.isPending && <ListSkeleton label={t('loading')} rows={5} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {sheet && (
        <>
          <MonthBanner sheet={sheet} />
          {sheet.rows.length === 0 ? (
            <EmptyState
              icon={<UsersRound />}
              title={t('emptyTitle')}
              description={sheet.scope === 'reports' ? t('emptyReports') : t('emptyBody')}
              action={
                sheet.scope === 'all' ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/team?tab=people">{t('emptyAction')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <MonthChips sheet={sheet} filter={active} onFilter={setFilter} />
              <MonthTable
                rows={shown}
                showsPay={sheet.showsPay}
                openId={personId}
                onOpen={(id) => go({ person: id })}
              />
              <MonthCards
                rows={shown}
                showsPay={sheet.showsPay}
                onOpen={(id) => go({ person: id })}
              />
            </>
          )}
          <LockDialog open={dialog === 'lock'} sheet={sheet} onClose={() => setDialog(null)} />
          <UnlockDialog open={dialog === 'unlock'} month={month} onClose={() => setDialog(null)} />
        </>
      )}
      <PersonPanel
        month={month}
        userId={personId}
        fallback={sheet?.rows.find((row) => row.person.id === personId) ?? null}
        onClose={() => go({ person: null })}
      />
    </section>
  );
}
