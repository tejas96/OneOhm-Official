'use client';

import type { DutyDay } from '@oneohm/api-contracts';
import { Button, cn, IconButton, Input } from '@oneohm/design-system/web';
import { addDays } from '@oneohm/shared';
import { ChevronLeft, ChevronRight, MapPinOff } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { DayTimeline } from './day-timeline';

export interface DayPerson {
  readonly id: string;
  readonly fullName: string;
  readonly initials: string;
  readonly avatarSwatch: number;
}

interface DayPanelProps {
  readonly person: DayPerson | null;
  readonly date: string;
  readonly today: string;
  readonly onDate: (date: string) => void;
  readonly query: {
    data?: DutyDay | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  readonly active: number;
  readonly picked: number | null;
  readonly onPick: (index: number) => void;
}

/** A person's day: the date, the day's numbers, and the timeline the replay follows. */
export function DayPanel({
  person,
  date,
  today,
  onDate,
  query,
  active,
  picked,
  onPick,
}: DayPanelProps) {
  const t = useTranslations('liveMap.day');
  const format = useFormatter();
  const day = query.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-5 pb-3">
        {person && (
          <span
            aria-hidden
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold text-on-accent bg-swatch-${person.avatarSwatch % 6}`}
          >
            {person.initials}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate type-title-md text-ink">{person?.fullName ?? t('title')}</h2>
          <p className="type-label text-ink-muted">
            {date === today
              ? t('today')
              : format.dateTime(new Date(`${date}T12:00:00`), {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-5 pb-4">
        <IconButton
          size="sm"
          variant="secondary"
          label={t('previousDay')}
          onClick={() => onDate(addDays(date, -1))}
        >
          <ChevronLeft aria-hidden />
        </IconButton>
        <Input
          type="date"
          aria-label={t('pickDate')}
          value={date}
          max={today}
          onChange={(event) => event.target.value && onDate(event.target.value)}
          className="h-9 min-w-0 flex-1"
        />
        <IconButton
          size="sm"
          variant="secondary"
          label={t('nextDay')}
          disabled={date >= today}
          onClick={() => onDate(addDays(date, 1))}
        >
          <ChevronRight aria-hidden />
        </IconButton>
        {date !== today && (
          <Button size="sm" variant="quiet" onClick={() => onDate(today)}>
            {t('today')}
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {query.isPending && (
          <div className="px-5 py-4">
            <ListSkeleton label={t('loading')} rows={4} />
          </div>
        )}
        {query.isError && (
          <div className="px-5 py-4">
            <LoadError error={query.error} onRetry={() => query.refetch()} />
          </div>
        )}
        {day && !day.duty && day.segments.length === 0 ? (
          <p className="px-5 py-8 text-center type-body-sm text-ink-muted">{t('noDuty')}</p>
        ) : (
          day && (
            <>
              <Totals day={day} />
              {!day.locationOn && (
                <p className="mx-5 mb-3 flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 type-body-sm text-ink-muted">
                  <MapPinOff aria-hidden className="size-4 shrink-0" />
                  {t('locationOff')}
                </p>
              )}
              <DayTimeline
                segments={day.segments}
                active={active}
                picked={picked}
                onPick={onPick}
              />
            </>
          )
        )}
      </div>
    </div>
  );
}

function Totals({ day }: { readonly day: DutyDay }) {
  const t = useTranslations('liveMap.day.totals');
  const { totals } = day;
  const km = (value: number | null) => (value === null ? '—' : value.toFixed(1));
  return (
    <dl className="mx-5 mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline">
      <Tile label={t('routeKm')} value={km(totals.routeKm)} unit="km" />
      <Tile
        label={t('paidKm')}
        value={km(totals.paidKm)}
        unit={totals.paidKm === null ? undefined : 'km'}
        hint={totals.paidKm === null ? t('paidLater') : undefined}
      />
      <Tile label={t('hours')} value={totals.hoursOnDuty.toFixed(1)} unit="h" />
      <Tile label={t('visits')} value={String(totals.visits)} />
      <Tile
        label={t('unknownStops')}
        value={String(totals.unknownStopMinutes)}
        unit="min"
        warn={totals.unknownStopMinutes > 0}
      />
      <Tile
        label={t('gaps')}
        value={String(totals.gapMinutes)}
        unit="min"
        warn={totals.gapMinutes > 0}
      />
    </dl>
  );
}

function Tile({
  label,
  value,
  unit,
  hint,
  warn = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | undefined;
  readonly hint?: string | undefined;
  readonly warn?: boolean;
}): ReactNode {
  return (
    <div className={cn('flex flex-col gap-1 bg-raised px-3 py-2.5', warn && 'bg-at-risk-tint')}>
      <dt className={cn('type-label text-ink-faint', warn && 'text-at-risk')}>{label}</dt>
      <dd className="flex items-baseline gap-1 text-ink tabular-nums">
        <span className="font-display text-[1.375rem] leading-none">{value}</span>
        {unit && <span className="type-label text-ink-faint">{unit}</span>}
      </dd>
      {hint && <span className="type-label text-ink-faint">{hint}</span>}
    </div>
  );
}
