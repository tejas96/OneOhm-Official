'use client';

import type { MonthSheetPerson, MonthSheetRow } from '@oneohm/api-contracts';
import { Avatar, Sheet, Skeleton, SkeletonGroup, StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadError } from '@/components/query-state';
import { Breakdown } from './breakdown';
import { DayDetail } from './day-detail';
import { DiffCard } from './diff-card';
import { FlagList } from './flag-list';
import { ItemsList } from './items-list';
import { MonthCalendar } from './month-calendar';
import { useMonthFormat } from './month-format';
import { useMonthPerson } from './use-month-sheet';

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3 border-t border-hairline pt-6 first:border-t-0 first:pt-0">
    <h3 className="type-title-md text-ink">{title}</h3>
    {children}
  </section>
);

function Body({ person }: { readonly person: MonthSheetPerson }) {
  const t = useTranslations('team.monthSheet.panel');
  const [selected, setSelected] = useState<string | null>(null);
  const day = person.days.find((candidate) => candidate.date === selected) ?? null;
  const changed =
    person.lock.status === 'locked' && (person.row.changes.length > 0 || !person.row.inLock);
  return (
    <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">
      {changed && <DiffCard person={person} />}
      <Section title={t('calendar')}>
        <MonthCalendar days={person.days} selected={selected} onSelect={setSelected} />
        <DayDetail day={day} userId={person.row.person.id} />
      </Section>
      <Section title={t('breakdown')}>
        <Breakdown person={person} />
      </Section>
      <Section title={t('flags')}>
        <FlagList person={person} />
      </Section>
      <Section title={t('items')}>
        <ItemsList items={person.items} />
      </Section>
    </div>
  );
}

/** One person's month in a side panel: calendar, the sums, what to check and the records behind it. */
export function PersonPanel({
  month,
  userId,
  fallback,
  onClose,
}: {
  readonly month: string;
  readonly userId: string | null;
  /** The sheet's row for this person, to show a name while the month loads. */
  readonly fallback: MonthSheetRow | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.monthSheet.panel');
  const words = useMonthFormat();
  const query = useMonthPerson(month, userId);
  const row = query.data?.row ?? fallback;
  const person = row?.person;
  return (
    <Sheet
      open={userId !== null}
      onOpenChange={(open) => !open && onClose()}
      width="lg"
      title={
        <span className="flex items-center gap-3">
          {person && <Avatar name={person.fullName} swatch={person.avatarSwatch} size="md" />}
          <span className="min-w-0 truncate">{person?.fullName ?? t('title')}</span>
        </span>
      }
      description={[person?.employeeCode, person?.designation, words.month(month)]
        .filter(Boolean)
        .join(' · ')}
      header={
        row && (
          <span className="flex flex-wrap gap-1.5">
            {row.amber && <StatusPill tone="atRisk" size="sm" label={t('check')} />}
            {row.changes.length > 0 && <StatusPill tone="review" size="sm" label={t('changed')} />}
            {!row.inLock && <StatusPill tone="neutral" size="sm" label={t('notInLock')} />}
          </span>
        )
      }
    >
      {query.isPending && (
        <SkeletonGroup label={t('loading')} className="flex flex-col gap-4 px-6 py-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </SkeletonGroup>
      )}
      {query.isError && (
        <div className="px-6 py-6">
          <LoadError error={query.error} onRetry={() => query.refetch()} />
        </div>
      )}
      {query.data && <Body key={`${month}-${userId}`} person={query.data} />}
    </Sheet>
  );
}
