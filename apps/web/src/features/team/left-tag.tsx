'use client';

import { Badge } from '@oneohm/design-system/web';
import { useFormatter, useTranslations } from 'next-intl';
import { calendarDate } from './workforce-format';

/** "3 Oct 2026" for the day someone left; the API may send a date or a full timestamp. */
export function useLeftDate() {
  const format = useFormatter();
  return (leftOn: string) =>
    format.dateTime(calendarDate(leftOn.slice(0, 10)), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
}

/** The small "Left 3 Oct 2026" tag on a past member's name, wherever it is shown. */
export function LeftTag({ leftOn }: { readonly leftOn: string | null }) {
  const t = useTranslations('team.status');
  const leftDate = useLeftDate();
  return (
    <Badge variant="outline">
      {leftOn ? t('left', { date: leftDate(leftOn) }) : t('leftNoDate')}
    </Badge>
  );
}
