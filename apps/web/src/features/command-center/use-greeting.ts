'use client';

import { useNow, useTranslations } from 'next-intl';
import { localHours, skyPhase } from '../auth/sun-path';

/** "Good morning" / "Good afternoon" / "Good evening" for the business's timezone. */
export function useGreeting(): string {
  const t = useTranslations('commandCenter.greeting');
  const now = useNow({ updateInterval: 60_000 });
  return t(skyPhase(localHours(now, 'Asia/Kolkata')));
}
