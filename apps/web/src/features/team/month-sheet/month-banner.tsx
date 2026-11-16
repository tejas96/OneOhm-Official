'use client';

import type { MonthSheet } from '@oneohm/api-contracts';
import { Eye, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMonthFormat } from './month-format';

/** Says plainly when the month is final, who locked it and every time it was opened again. */
export function MonthBanner({ sheet }: { readonly sheet: MonthSheet }) {
  const t = useTranslations('team.monthSheet.banner');
  const words = useMonthFormat();
  const name = words.monthName(sheet.month);
  return (
    <div className="flex flex-col gap-2">
      {sheet.status === 'locked' && sheet.lockedAt && sheet.lockedBy && (
        <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-on-track-tint px-4 py-3">
          <p className="flex items-center gap-2 type-body font-medium text-on-track">
            <Lock aria-hidden className="size-4 shrink-0" />
            {t('final', {
              month: name,
              name: sheet.lockedBy.fullName,
              date: words.moment(sheet.lockedAt),
            })}
          </p>
          {sheet.unlocks.length > 0 && (
            <ul className="flex flex-col gap-0.5 type-body-sm text-ink-muted">
              {sheet.unlocks.map((unlock) => (
                <li key={unlock.at}>
                  {t('unlocked', {
                    name: unlock.by.fullName,
                    date: words.moment(unlock.at),
                    reason: unlock.reason,
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {sheet.status === 'open' && sheet.unlocks.length > 0 && (
        <p className="type-body-sm text-ink-muted">
          {t('openedAgain', {
            name: sheet.unlocks.at(-1)?.by.fullName ?? '',
            reason: sheet.unlocks.at(-1)?.reason ?? '',
          })}
        </p>
      )}
      {sheet.scope === 'reports' && (
        <p className="flex items-center gap-2 type-body-sm text-ink-muted">
          <Eye aria-hidden className="size-4 shrink-0" />
          {t('readOnly')}
        </p>
      )}
    </div>
  );
}
