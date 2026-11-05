'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { EmptyState, Select } from '@oneohm/design-system/web';
import { Route } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useFocusRow } from '@/lib/use-focus-row';
import { useCan } from '@/providers/current-user';
import { ClaimSheet } from './claim-sheet';
import { ClaimsTable } from './claims-table';
import { type ClaimState, claimState, useTravelClaims } from './use-travel';

const STATES = ['all', 'pending', 'approved', 'paid', 'rejected', 'cancelled'] as const;
type StateFilter = (typeof STATES)[number];

/**
 * Travel claims for approvers and finance: filter by status, person and month (PRD 4.3).
 * `?claim=<id>` opens one claim's sheet (an approval's or alert's "Open").
 */
export function TravelTab() {
  const t = useTranslations('siteActivity.claims');
  const format = useFormatter();
  const allowed = useCan('leave.approve', 'finance.view');
  const query = useTravelClaims(allowed);
  const [state, setState] = useState<StateFilter>('all');
  const [person, setPerson] = useState('all');
  const [month, setMonth] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const claims = query.data ?? [];
  const focused = useFocusRow('claim', query.data, (claim) => setOpenId(claim.id));

  const people = useMemo(
    () => [...new Map(claims.map((claim) => [claim.user.id, claim.user.fullName])).entries()],
    [claims],
  );
  const months = useMemo(
    () => [...new Set(claims.map((claim) => claim.workDate.slice(0, 7)))].sort().reverse(),
    [claims],
  );
  const shown = claims
    .filter((claim) => state === 'all' || claimState(claim) === (state as ClaimState))
    .filter((claim) => person === 'all' || claim.user.id === person)
    .filter((claim) => month === 'all' || claim.workDate.startsWith(month));
  const waiting = claims.filter((claim) => claim.status === 'pending').length;
  const open: TravelClaim | null = claims.find((claim) => claim.id === openId) ?? null;
  const monthLabel = (value: string) =>
    format.dateTime(new Date(`${value}-15T12:00:00`), { month: 'long', year: 'numeric' });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="type-title-lg text-ink">{t('title')}</h2>
        <p className="max-w-3xl type-body-sm text-ink-faint">{t('description')}</p>
      </div>
      {waiting > 0 && (
        <p className="type-body-sm font-medium text-ink">{t('waiting', { count: waiting })}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-3xl">
        <Select
          value={state}
          onValueChange={setState}
          label={t('statusLabel')}
          options={STATES.map((value) => ({
            value,
            label: value === 'all' ? t('allStatuses') : t(`status.${value}`),
          }))}
        />
        <Select
          value={person}
          onValueChange={setPerson}
          label={t('personLabel')}
          options={[
            { value: 'all', label: t('allPeople') },
            ...people.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <Select
          value={month}
          onValueChange={setMonth}
          label={t('monthLabel')}
          options={[
            { value: 'all', label: t('allMonths') },
            ...months.map((value) => ({ value, label: monthLabel(value) })),
          ]}
        />
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && shown.length === 0 && (
        <EmptyState icon={<Route />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {shown.length > 0 && (
        <ClaimsTable claims={shown} onOpen={(claim) => setOpenId(claim.id)} focused={focused} />
      )}
      <ClaimSheet claim={open} onClose={() => setOpenId(null)} />
    </section>
  );
}
