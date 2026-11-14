'use client';

import { useTranslations } from 'next-intl';
import { useSky } from './sky-art';
import { greetingPart } from './sun-path';

/** Wide screens: the same hour-matched greeting the phone sky shows, on the brand panel. */
export function PanelGreeting() {
  const t = useTranslations('signIn.sky');
  const { hours, phase } = useSky();
  return (
    <p className="flex flex-col gap-1">
      <span className="type-overline text-on-panel-muted uppercase">
        {t(`hello.${greetingPart(hours)}`)}
      </span>
      <span className="text-[1.375rem] leading-7 text-on-panel [font-family:var(--font-display)]">
        {t(`line.${phase}`)}
      </span>
    </p>
  );
}
