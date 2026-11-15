'use client';

import type { CampaignDefaults } from '@oneohm/api-contracts';
import { Checkbox, cn } from '@oneohm/design-system/web';
import type { CampaignChannel, MessageSegment } from '@oneohm/domain';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChannelIcon } from './channel-icons';
import { type Draft, NEEDS_PHOTO, placesFor } from './compose-checks';

/** Why a place cannot be picked right now, in plain words; null when it can. */
function blockedWhy(
  channel: CampaignChannel,
  defaults: CampaignDefaults,
  draft: Pick<Draft, 'mediaKind'>,
  needsPhoto: string,
): string | null {
  if (NEEDS_PHOTO.includes(channel) && draft.mediaKind === 'video') return needsPhoto;
  if (defaults.ready[channel]) return null;
  return defaults.why[channel] ?? '';
}

/** Instagram, Facebook, Google and WhatsApp messages as toggle tiles; a place not ready is dimmed. */
export function PlacesPicker({
  defaults,
  draft,
  onToggle,
  onSegment,
}: {
  readonly defaults: CampaignDefaults;
  readonly draft: Draft;
  readonly onToggle: (channel: CampaignChannel) => void;
  readonly onSegment: (segment: MessageSegment) => void;
}) {
  const t = useTranslations('marketing');
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">{t('places.label')}</legend>
        {placesFor(draft.goal).map((channel) => {
          const why = blockedWhy(
            channel,
            defaults,
            draft,
            t(channel === 'google' ? 'places.googleNeedsPhoto' : 'places.whatsappNeedsPhoto'),
          );
          const on = draft.channels.includes(channel);
          const video = NEEDS_PHOTO.includes(channel) && draft.mediaKind === 'video';
          return (
            <div
              key={channel}
              className={cn(
                'flex flex-col gap-1 rounded-xl border p-3 transition-colors',
                on ? 'border-accent bg-accent-soft' : 'border-hairline bg-raised',
                why !== null && 'bg-sunken/60',
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                disabled={why !== null}
                onClick={() => onToggle(channel)}
                className={cn(
                  'flex items-center gap-2.5 text-left outline-offset-4',
                  why !== null && 'opacity-55',
                )}
              >
                <ChannelIcon channel={channel} className="size-8" />
                <span className="min-w-0 flex-1 type-title-md text-ink">
                  {t(`channelLong.${channel}`)}
                </span>
                <motion.span
                  aria-hidden
                  animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }}
                  className="size-2.5 rounded-full bg-accent"
                />
              </button>
              {why !== null && (
                <p className="type-body-sm text-ink-muted">
                  {why}
                  {!video && (
                    <>
                      {' '}
                      <Link
                        href="/marketing?tab=connections"
                        className="font-medium text-accent underline underline-offset-2"
                      >
                        {t('places.connect')}
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
      {draft.channels.includes('whatsapp') && (
        <div className="flex flex-col gap-1 rounded-xl bg-sunken/70 p-3">
          <p className="type-label text-ink-muted">{t('places.whoGets')}</p>
          {defaults.segments.map(({ segment, count }) => (
            <Checkbox
              key={segment}
              checked={draft.segments.includes(segment)}
              onCheckedChange={() => onSegment(segment)}
              label={t('places.segment', { name: t(`segment.${segment}`), count })}
              disabled={count === 0 && !draft.segments.includes(segment)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
