'use client';

import type { MonthSheetRow } from '@oneohm/api-contracts';
import { Avatar, cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { FlagPills } from './flag-pills';
import { dayCount, lateText } from './month-math';
import { RowTags } from './month-table';

const Stat = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <div className="flex flex-col">
    <dt className="type-label text-ink-faint">{label}</dt>
    <dd className="type-body tabular-nums text-ink">{value}</dd>
  </div>
);

/** The same rows as cards on a phone: payable days first, then the counts and the money. */
export function MonthCards({
  rows,
  showsPay,
  onOpen,
}: {
  readonly rows: readonly MonthSheetRow[];
  readonly showsPay: boolean;
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('team.monthSheet.table');
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {rows.map((row) => {
        const { person, counts, money } = row;
        return (
          <li
            key={person.id}
            className={cn(
              'relative flex flex-col gap-3 overflow-hidden rounded-xl border border-hairline bg-raised p-4',
              'focus-within:ring-2 focus-within:ring-accent',
            )}
          >
            {row.amber && (
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-at-risk-solid" />
            )}
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={person.fullName} swatch={person.avatarSwatch} size="sm" />
                <span className="flex min-w-0 flex-col">
                  {/* The name is the button; it stretches over the whole card to open it. */}
                  <button
                    type="button"
                    onClick={() => onOpen(person.id)}
                    aria-label={t('openRow', { name: person.fullName })}
                    className="cursor-pointer truncate text-left type-body font-medium text-ink outline-none after:absolute after:inset-0 after:content-['']"
                  >
                    {person.fullName}
                  </button>
                  {person.employeeCode && (
                    <span className="font-mono text-[0.75rem] text-ink-faint">
                      {person.employeeCode}
                    </span>
                  )}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="type-title-lg tabular-nums text-ink">
                  {dayCount(counts.payableDays)}
                </span>
                <span className="type-label text-ink-faint">{t('columns.payable')}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 empty:hidden">
              <RowTags row={row} />
            </div>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
              <Stat label={t('columns.present')} value={dayCount(counts.present)} />
              <Stat label={t('columns.half')} value={dayCount(counts.halfDays)} />
              <Stat label={t('columns.absent')} value={dayCount(counts.absent)} />
              <Stat
                label={t('columns.late')}
                value={lateText(counts.lates, counts.lateDeduction)}
              />
              {showsPay && money.grossPaise !== null && (
                <Stat label={t('columns.gross')} value={formatInr(money.grossPaise)} />
              )}
              <Stat label={t('columns.travel')} value={formatInr(money.travelApprovedPaise)} />
            </dl>
            <FlagPills flags={row.flags} />
          </li>
        );
      })}
    </ul>
  );
}
