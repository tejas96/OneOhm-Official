'use client';

import type { MonthSheetRow } from '@oneohm/api-contracts';
import { Avatar, cn, StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { FlagPills } from './flag-pills';
import { dayCount, lateText } from './month-math';

const Num = ({ value }: { readonly value: number }) => (
  <span className={cn('tabular-nums', value === 0 && 'text-ink-faint')}>{dayCount(value)}</span>
);

const Money = ({ paise }: { readonly paise: number | null }) =>
  paise === null ? (
    <span className="text-ink-faint">—</span>
  ) : (
    <span className="tabular-nums">{formatInr(paise)}</span>
  );

/**
 * The tags next to a name: "Check" for amber rows, "Changed after lock" when the facts moved,
 * "Not in the locked sheet" for someone who qualified after the lock.
 */
export function RowTags({ row }: { readonly row: MonthSheetRow }) {
  const t = useTranslations('team.monthSheet.table');
  return (
    <>
      {row.amber && <StatusPill tone="atRisk" size="sm" label={t('check')} />}
      {row.changes.length > 0 && <StatusPill tone="review" size="sm" label={t('changed')} />}
      {!row.inLock && <StatusPill tone="neutral" size="sm" label={t('notInLock')} />}
    </>
  );
}

function Identity({ row }: { readonly row: MonthSheetRow }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={row.person.fullName} swatch={row.person.avatarSwatch} size="sm" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate type-body font-medium text-ink">{row.person.fullName}</span>
        {row.person.employeeCode && (
          <span className="truncate font-mono text-[0.75rem] text-ink-faint">
            {row.person.employeeCode}
          </span>
        )}
      </span>
    </span>
  );
}

const head =
  'border-b border-hairline bg-surface px-3 py-2.5 type-label font-medium text-ink-faint';
const cell = 'border-b border-hairline px-3 py-3 text-right align-middle type-body text-ink';

/** One row per person: the counts that make the payable days, then the money and what to check. */
export function MonthTable({
  rows,
  showsPay,
  openId,
  onOpen,
}: {
  readonly rows: readonly MonthSheetRow[];
  readonly showsPay: boolean;
  readonly openId: string | null;
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('team.monthSheet.table');
  const columns = [
    'working',
    'present',
    'half',
    'absent',
    'paidLeave',
    'unpaidLeave',
    'off',
    'late',
    'payable',
    ...(showsPay ? (['pay', 'gross'] as const) : []),
    'travel',
    'bonus',
  ] as const;
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-hairline bg-raised md:block">
      <table className="w-full border-separate border-spacing-0">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(
                head,
                'sticky left-0 z-[2] min-w-56 text-left shadow-[1px_0_0_var(--color-hairline)]',
              )}
            >
              {t('person')}
            </th>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  head,
                  'whitespace-nowrap text-right',
                  column === 'payable' && 'text-ink',
                )}
              >
                {t(`columns.${column}`)}
              </th>
            ))}
            <th scope="col" className={cn(head, 'min-w-36 text-left')}>
              {t('flags')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { person, counts, money, flags, amber, changes } = row;
            return (
              <tr
                key={person.id}
                aria-current={person.id === openId ? 'true' : undefined}
                onClick={() => onOpen(person.id)}
                className="group cursor-pointer"
              >
                <td
                  className={cn(
                    'sticky left-0 z-[1] border-b border-hairline bg-raised px-3 py-3 shadow-[1px_0_0_var(--color-hairline)] transition-colors group-hover:bg-sunken group-aria-[current=true]:bg-accent-soft',
                  )}
                >
                  {amber && (
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-at-risk-solid" />
                  )}
                  <span className="flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(person.id);
                      }}
                      className="min-w-0 max-w-full cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Identity row={row} />
                    </button>
                    {(amber || changes.length > 0) && (
                      <span className="flex flex-wrap gap-1.5">
                        <RowTags row={row} />
                      </span>
                    )}
                  </span>
                </td>
                <td className={cell}>
                  <Num value={counts.workingDays} />
                </td>
                <td className={cell}>
                  <Num value={counts.present} />
                </td>
                <td className={cell}>
                  <Num value={counts.halfDays} />
                </td>
                <td className={cell}>
                  <Num value={counts.absent} />
                </td>
                <td className={cell}>
                  <Num value={counts.paidLeave} />
                </td>
                <td className={cell}>
                  <Num value={counts.unpaidLeave} />
                </td>
                <td className={cell}>
                  <Num value={counts.holidays + counts.weeklyOffs} />
                </td>
                <td className={cell}>
                  <span className="tabular-nums">
                    {lateText(counts.lates, counts.lateDeduction)}
                  </span>
                </td>
                <td className={cn(cell, 'font-semibold')}>
                  <span className="tabular-nums">{dayCount(counts.payableDays)}</span>
                </td>
                {showsPay && (
                  <>
                    <td className={cell}>
                      <Money paise={money.monthlyPayPaise} />
                    </td>
                    <td className={cn(cell, 'font-medium')}>
                      <Money paise={money.grossPaise} />
                    </td>
                  </>
                )}
                <td className={cell}>
                  <span className="flex flex-col items-end">
                    <Money paise={money.travelApprovedPaise} />
                    {money.travelPaidPaise > 0 && (
                      <span className="type-label text-ink-faint">
                        {t('paid', { amount: formatInr(money.travelPaidPaise) })}
                      </span>
                    )}
                  </span>
                </td>
                <td className={cell}>
                  <Money paise={money.bonusPaise} />
                </td>
                <td className="border-b border-hairline px-3 py-3 text-left align-middle">
                  <FlagPills flags={flags} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
