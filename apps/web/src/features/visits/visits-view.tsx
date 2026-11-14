'use client';

import type { VisitListRow } from '@oneohm/api-contracts';
import { Button, type PillTone, Select, StatusPill } from '@oneohm/design-system/web';
import { addDays, todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

const TONE: Readonly<Record<VisitListRow['status'], PillTone>> = {
  proposed: 'review',
  confirmed: 'done',
  done: 'done',
  cancelled: 'neutral',
  missed: 'atRisk',
};

const EVERYONE = 'all';

/** Where a visit's work lives: the lead, the project or the service ticket. */
function hrefOf(row: VisitListRow): string | null {
  if (row.serviceRequestId) return `/service?request=${row.serviceRequestId}`;
  if (row.projectId) return `/projects/${row.projectId}`;
  if (row.leadId) return `/leads/${row.leadId}`;
  return null;
}

/** The visits page: a week of visits by day, for everyone or one person, with who comes and when. */
export function VisitsView() {
  const t = useTranslations('visits');
  const format = useFormatter();
  const [from, setFrom] = useState(todayIn());
  const [person, setPerson] = useState(EVERYONE);
  const to = addDays(from, 6);
  const list = useQuery({
    queryKey: ['visits', 'list', from, to, person],
    queryFn: () =>
      expectStatus(
        api.visits.listVisits({
          query: { from, to, ...(person === EVERYONE ? {} : { userId: person }) },
        }),
        200,
      ),
  });
  const rows = list.data ?? [];
  const people = new Map(rows.flatMap((row) => row.crew.map((one) => [one.id, one.name])));
  const days = [...new Set(rows.map((row) => row.day))];
  const dayLabel = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-1">
        <p className="type-overline text-ink-faint uppercase">{t('page.overline')}</p>
        <h1 className="type-display-lg text-ink">{t('page.title')}</h1>
        <p className="type-body text-ink-muted">{t('page.intro')}</p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          aria-label={t('page.earlier')}
          leadingIcon={<ChevronLeft />}
          onClick={() => setFrom(addDays(from, -7))}
        />
        <span className="type-body font-medium text-ink">
          {dayLabel(from)} – {dayLabel(to)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t('page.later')}
          leadingIcon={<ChevronRight />}
          onClick={() => setFrom(addDays(from, 7))}
        />
        <Button variant="quiet" size="sm" onClick={() => setFrom(todayIn())}>
          {t('page.thisWeek')}
        </Button>
        <div className="ml-auto w-56">
          <Select
            value={person}
            onValueChange={setPerson}
            options={[
              { value: EVERYONE, label: t('page.everyone') },
              ...[...people].map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
      </div>
      {list.isLoading && <p className="type-body text-ink-muted">{t('page.loading')}</p>}
      {list.isError && <p className="type-body text-overdue">{t('page.failed')}</p>}
      {!list.isLoading && rows.length === 0 && (
        <p className="rounded-3xl border border-hairline bg-raised p-6 type-body text-ink-muted">
          {t('page.empty')}
        </p>
      )}
      {days.map((day) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="type-overline text-ink-faint uppercase">{dayLabel(day)}</h2>
          <ul className="flex flex-col divide-y divide-hairline rounded-3xl border border-hairline bg-raised">
            {rows
              .filter((row) => row.day === day)
              .map((row) => (
                <VisitRow key={row.id} row={row} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function VisitRow({ row }: { readonly row: VisitListRow }) {
  const t = useTranslations('visits');
  const href = hrefOf(row);
  const name = <span className="type-body font-medium text-ink">{row.customer}</span>;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
      <span className="w-36 type-body font-medium text-ink tabular-nums">{row.time}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        {href ? (
          <Link href={href} className="hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
        <span className="type-body-sm text-ink-faint">
          {t(`title.${row.kind}`)}
          {row.home ? ` · ${row.home}` : ''}
          {row.crew.length ? ` · ${row.crew.map((one) => one.name).join(', ')}` : ''}
        </span>
      </span>
      {row.phone && (
        <a
          href={`tel:${row.phone}`}
          className="inline-flex items-center gap-1 type-body-sm text-accent"
          aria-label={t('page.call', { name: row.customer })}
        >
          <Phone aria-hidden className="size-4" />
          {row.phone}
        </a>
      )}
      {row.customerConfirmed && (
        <span className="type-body-sm text-ink-muted">{t('customerConfirmed')}</span>
      )}
      <StatusPill size="sm" tone={TONE[row.status]} label={t(`status.${row.status}`)} />
    </li>
  );
}
