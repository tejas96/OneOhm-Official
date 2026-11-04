'use client';

import { useNow, useTranslations } from 'next-intl';
import { greetingPart, localHours } from '../auth/sun-path';

/** "Good morning" / "Good afternoon" / "Good evening" (or "Hello" late at night) for the business's timezone. */
export function useGreeting(): string {
  const t = useTranslations('commandCenter.greeting');
  const now = useNow({ updateInterval: 60_000 });
  return t(greetingPart(localHours(now, 'Asia/Kolkata')));
}
