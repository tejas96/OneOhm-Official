'use client';

import { cn } from '@oneohm/design-system/web';
import { ImageIcon, Video } from 'lucide-react';
import { mediaSrc } from './marketing-words';

/** The campaign's photo, or a calm tile with a video or picture icon. */
export function CampaignThumb({
  url,
  kind,
  className,
}: {
  readonly url: string | null;
  readonly kind: 'image' | 'video' | null;
  readonly className?: string;
}) {
  const src = mediaSrc(url);
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sunken text-ink-faint',
        className,
      )}
    >
      {src && kind === 'image' ? (
        // biome-ignore lint/performance/noImgElement: an API path, not a static asset
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : kind === 'video' ? (
        <Video aria-hidden className="size-5" />
      ) : (
        <ImageIcon aria-hidden className="size-5" />
      )}
    </span>
  );
}
