'use client';

import type { LivePerson } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { minutesSince, toneOf } from './live-format';

/** The person's initials on their swatch, ringed in the state's colour (as on the map). */
export function PersonAvatar({
  person,
  size = 'md',
}: {
  readonly person: LivePerson;
  readonly size?: 'md' | 'lg';
}) {
  return (
    <span
      aria-hidden
      style={{ '--tone': toneOf(person.state) } as CSSProperties}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-on-accent',
        'shadow-[0_0_0_2px_var(--oh-raised),0_0_0_4px_var(--tone)]',
        `bg-swatch-${person.person.avatarSwatch % 6}`,
        size === 'md' ? 'size-9 text-[0.75rem]' : 'size-14 text-base',
      )}
    >
      {person.person.initials}
      {person.state === 'location_off' && (
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-duty-off text-raised shadow-[0_0_0_2px_var(--oh-raised)]">
          <MapPinOff className="size-2.5" strokeWidth={2.6} />
        </span>
      )}
    </span>
  );
}

/** A dot and the state's word, for lists and cards. */
export function StateTag({ person }: { readonly person: LivePerson }) {
  const t = useTranslations('liveMap');
  return (
    <span
      style={{ '--tone': toneOf(person.state) } as CSSProperties}
      className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--tone)_13%,transparent)] px-2.5 py-1 type-label text-ink"
    >
      <span aria-hidden className="size-2 rounded-full bg-(--tone)" />
      {t(`state.${person.state}`)}
    </span>
  );
}

/** What the person is doing, in a few words ("At Sharma home", "No signal for 25 min"). */
export function useDoing(): (person: LivePerson, now: number) => string {
  const t = useTranslations('liveMap.doing');
  return (person, now) => {
    const heard = person.position?.at ?? person.today.dutyStartedAt;
    switch (person.state) {
      case 'on_visit':
        return t('on_visit', { label: person.today.currentVisit?.label ?? '' });
      case 'gap':
        return t('gap', { minutes: heard ? minutesSince(heard, now) : 0 });
      case 'off_duty':
        return person.today.kmSoFar
          ? t('off_duty_done', { km: person.today.kmSoFar })
          : t('off_duty');
      default:
        return t(person.state);
    }
  };
}

/** "2 min ago", "just now", or nothing when the person was never seen today. */
export function useLastSeen(): (person: LivePerson, now: number) => string | null {
  const t = useTranslations('liveMap.seen');
  return (person, now) => {
    if (!person.position) return null;
    const minutes = minutesSince(person.position.at, now);
    if (minutes < 1) return t('now');
    if (minutes < 60) return t('minutes', { minutes });
    return t('hours', { hours: Math.floor(minutes / 60) });
  };
}
