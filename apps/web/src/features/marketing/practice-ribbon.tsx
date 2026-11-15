'use client';

import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Shown in practice mode so no one thinks a real ad went out. */
export function PracticeRibbon() {
  const t = useTranslations('marketing');
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg bg-review-tint px-3 py-2 type-body-sm font-medium text-review"
    >
      <FlaskConical aria-hidden className="size-4 shrink-0" />
      {t('practice')}
    </p>
  );
}
