'use client';

import type { MonthSheet } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { dayCount } from './month-math';

export type MonthFilter = 'all' | 'check' | 'changed' | 'notInLock';

function Chip({
  label,
  value,
  note,
  tone,
  pressed,
  onPress,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string | undefined;
  readonly tone?: 'amber' | undefined;
  readonly pressed?: boolean | undefined;
  readonly onPress?: (() => void) | undefined;
}) {
  const body = (
    <>
      <span className="type-label text-ink-faint">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'type-title-md tabular-nums',
            tone === 'amber' ? 'text-at-risk' : 'text-ink',
          )}
        >
          {value}
        </span>
        {note && <span className="type-body-sm text-ink-faint">{note}</span>}
      </span>
    </>
  );
  const shape = 'flex min-w-28 flex-col gap-0.5 rounded-xl border px-4 py-2.5 text-left';
  if (!onPress) return <li className={cn(shape, 'border-hairline bg-raised')}>{body}</li>;
  return (
    <li className="contents">
      <button
        type="button"
        aria-pressed={pressed}
        onClick={onPress}
        className={cn(
          shape,
          'cursor-pointer transition-colors hover:border-rule',
          pressed ? 'border-accent bg-accent-soft' : 'border-hairline bg-raised',
        )}
      >
        {body}
      </button>
    </li>
  );
}

/** The month in a few numbers; the two that need action filter the table when pressed. */
export function MonthChips({
  sheet,
  filter,
  onFilter,
}: {
  readonly sheet: MonthSheet;
  readonly filter: MonthFilter;
  readonly onFilter: (filter: MonthFilter) => void;
}) {
  const t = useTranslations('team.monthSheet.chips');
  const { summary } = sheet;
  const toggle = (next: MonthFilter) => onFilter(filter === next ? 'all' : next);
  return (
    <ul aria-label={t('label')} className="flex flex-wrap gap-3">
      <Chip label={t('people')} value={String(summary.people)} />
      <Chip label={t('payableDays')} value={dayCount(summary.payableDays)} />
      {sheet.showsPay && summary.grossPaise !== null && (
        <Chip label={t('gross')} value={formatInr(summary.grossPaise)} />
      )}
      <Chip
        label={t('travel')}
        value={formatInr(summary.travelApprovedPaise)}
        note={t('paid', { amount: formatInr(summary.travelPaidPaise) })}
      />
      {summary.amberRows > 0 && (
        <Chip
          label={t('check')}
          value={String(summary.amberRows)}
          tone="amber"
          pressed={filter === 'check'}
          onPress={() => toggle('check')}
        />
      )}
      {summary.changedRows > 0 && (
        <Chip
          label={t('changed')}
          value={String(summary.changedRows)}
          tone="amber"
          pressed={filter === 'changed'}
          onPress={() => toggle('changed')}
        />
      )}
      {summary.notInLockRows > 0 && (
        <Chip
          label={t('notInLock')}
          value={String(summary.notInLockRows)}
          tone="amber"
          pressed={filter === 'notInLock'}
          onPress={() => toggle('notInLock')}
        />
      )}
    </ul>
  );
}
