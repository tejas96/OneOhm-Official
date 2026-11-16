'use client';

import type { MonthSheetRow } from '@oneohm/api-contracts';
import type { MonthFlagKind } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useMonthFormat } from './month-format';
import { FLAG_ICON, FLAG_TEXT } from './month-style';

/** What needs a look on a row: one small icon with the number of days for each kind. */
export function FlagPills({ flags }: { readonly flags: MonthSheetRow['flags'] }) {
  const t = useTranslations('team.monthSheet.flags');
  const words = useMonthFormat();
  if (flags.length === 0) return <span className="type-body-sm text-ink-faint">{t('none')}</span>;
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {flags.map((flag) => {
        const Icon = FLAG_ICON[flag.kind as MonthFlagKind];
        const when = flag.days.map(words.shortDay).join(', ');
        const label = `${t(`${flag.kind}.title`)}: ${when}`;
        return (
          <li
            key={flag.kind}
            title={label}
            className={`inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 type-label tabular-nums ${FLAG_TEXT[flag.kind]}`}
          >
            <Icon aria-hidden className="size-3.5" />
            <span aria-hidden>{flag.days.length}</span>
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
