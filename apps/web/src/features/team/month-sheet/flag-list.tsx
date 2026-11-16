'use client';

import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMonthFormat } from './month-format';
import { fixLinks } from './month-links';
import { FLAG_ICON, FLAG_TEXT } from './month-style';

/** Each thing to check, in plain words, with the days it is about and one tap to where it is fixed. */
export function FlagList({ person }: { readonly person: MonthSheetPerson }) {
  const t = useTranslations('team.monthSheet.flags');
  const fixT = useTranslations('team.monthSheet.fix');
  const words = useMonthFormat();
  const { flags } = person.row;
  if (flags.length === 0)
    return (
      <p className="flex items-center gap-2 type-body-sm text-on-track">
        <CircleCheck aria-hidden className="size-4" />
        {t('allClear')}
      </p>
    );
  return (
    <ul className="flex flex-col gap-3">
      {flags.map((flag) => {
        const Icon = FLAG_ICON[flag.kind];
        const fixes = fixLinks(flag.kind, flag.days, person.row.person.id, person.items);
        return (
          <li
            key={flag.kind}
            className="flex flex-col gap-2 rounded-lg border border-hairline p-3.5"
          >
            <div className="flex items-start gap-2.5">
              <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${FLAG_TEXT[flag.kind]}`} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="type-body font-medium text-ink">{t(`${flag.kind}.title`)}</p>
                <p className="type-body-sm text-ink-muted">{t(`${flag.kind}.hint`)}</p>
                <p className="type-body-sm text-ink-faint">
                  {flag.days.map(words.shortDay).join(', ')}
                </p>
              </div>
            </div>
            {fixes.length > 0 && (
              <ul className="flex flex-wrap gap-2 pl-6.5">
                {fixes.map((fix) => (
                  <li key={fix.href}>
                    <Link
                      href={fix.href}
                      className="inline-flex min-h-8 items-center rounded-full border border-hairline bg-raised px-3 type-body-sm text-accent transition-colors hover:border-rule hover:bg-accent-soft"
                    >
                      {fixT(fix.kind, {
                        date: fix.date ? words.shortDay(fix.date) : '',
                        detail: fix.detail ?? '',
                      })}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
