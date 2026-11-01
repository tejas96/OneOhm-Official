'use client';

import { Badge } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

/** Marks a home the state top-up may apply to (PRD 3.5). */
export function LowIncomeBadge() {
  const t = useTranslations('stateSupport.household');
  return <Badge variant="soft">{t('badge')}</Badge>;
}
