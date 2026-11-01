'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { AudioLines } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { documentUrl } from '@/lib/api/upload';
import { isAudio, titleOf } from './document-kinds';

/**
 * A voice note or a video played right in the preview, with the browser's own controls
 * (seeking asks the file route for one part at a time). When the browser cannot play
 * the file (an iPhone HEVC video in some browsers), `onFailed` swaps in the paper tile.
 */
export function PreviewPlayback({
  document,
  onFailed,
}: {
  readonly document: DocumentRecord;
  readonly onFailed: () => void;
}) {
  const t = useTranslations('documents.gallery.preview');
  const src = documentUrl(document.id);
  if (!isAudio(document.contentType)) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: site videos from the field have no spoken script to caption.
      <video
        controls
        playsInline
        preload="metadata"
        src={src}
        aria-label={titleOf(document.name)}
        onError={onFailed}
        className="max-h-[55dvh] min-h-48 w-full bg-black object-contain"
      />
    );
  }
  return (
    <div className="flex flex-col gap-5 bg-sunken px-5 py-7 sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-on-accent-soft">
          <AudioLines aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="type-overline text-ink-faint uppercase">{t('voiceNote')}</span>
          <span className="truncate type-title-md text-ink">{titleOf(document.name)}</span>
        </div>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: a voice note's words are the note itself. */}
      <audio
        controls
        preload="metadata"
        src={src}
        aria-label={titleOf(document.name)}
        onError={onFailed}
        className="w-full"
      />
    </div>
  );
}
