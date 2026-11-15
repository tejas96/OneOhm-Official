'use client';

import type { CampaignCard } from '@oneohm/api-contracts';
import { cn, StatusPill, useCalmMotion } from '@oneohm/design-system/web';
import { useFormatter, useTranslations } from 'next-intl';
import { LOOK_TONE } from './marketing-words';

/** The campaign's one status in plain words; "Live" breathes softly so it feels alive. */
export function LookPill({
  card,
  size = 'sm',
}: {
  readonly card: Pick<CampaignCard, 'look' | 'startsAt'>;
  readonly size?: 'sm' | 'md';
}) {
  const t = useTranslations('marketing');
  const format = useFormatter();
  const calm = useCalmMotion();
  const label =
    card.look === 'scheduled' && card.startsAt
      ? t('look.scheduledOn', {
          date: format.dateTime(new Date(card.startsAt), { day: 'numeric', month: 'short' }),
        })
      : t(`look.${card.look}`);
  return (
    <span className="relative inline-flex">
      {card.look === 'live' && !calm && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-on-track/25 [animation-duration:2.4s]"
        />
      )}
      <StatusPill
        tone={LOOK_TONE[card.look]}
        label={label}
        size={size}
        glyph={card.look === 'live' ? 'onTrack' : undefined}
        className={cn('relative')}
      />
    </span>
  );
}
