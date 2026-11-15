'use client';

import { cn } from '@oneohm/design-system/web';
import type { CampaignChannel } from '@oneohm/domain';
import { Camera, MessageCircle, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ICON = {
  instagram: Camera,
  facebook: Users,
  google: Search,
  whatsapp: MessageCircle,
} as const satisfies Record<CampaignChannel, unknown>;

const TINT = {
  instagram: 'bg-accent-soft text-on-accent-soft',
  facebook: 'bg-review-tint text-review',
  google: 'bg-at-risk-tint text-at-risk',
  whatsapp: 'bg-on-track-tint text-on-track',
} as const satisfies Record<CampaignChannel, string>;

/** One place a campaign runs, as a small round icon with its name for screen readers. */
export function ChannelIcon({
  channel,
  className,
}: {
  readonly channel: CampaignChannel;
  readonly className?: string;
}) {
  const t = useTranslations('marketing');
  const Icon = ICON[channel];
  return (
    <span
      title={t(`channel.${channel}`)}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-full [&_svg]:size-3.5',
        TINT[channel],
        className,
      )}
    >
      <Icon aria-hidden />
      <span className="sr-only">{t(`channel.${channel}`)}</span>
    </span>
  );
}

/** The places of a campaign in a row. */
export function ChannelRow({ channels }: { readonly channels: readonly CampaignChannel[] }) {
  return (
    <span className="flex items-center gap-1">
      {channels.map((channel) => (
        <ChannelIcon key={channel} channel={channel} />
      ))}
    </span>
  );
}
