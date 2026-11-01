'use client';

import type { Attachment } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { FileText, ImageOff, LoaderCircle, RotateCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { documentUrl } from '@/lib/api/upload';
import { VideoFrame } from './gallery/video-frame';
import { VoiceNoteThumb } from './voice-note-thumb';

/** Browsers show JPEG, PNG and WebP; HEIC and PDF get a labelled tile instead. */
export const previewable = (contentType: string) =>
  ['image/jpeg', 'image/png', 'image/webp'].includes(contentType);

const TILE =
  'group relative flex aspect-square overflow-hidden rounded-xl bg-sunken ring-1 ring-hairline';

/**
 * A stored file: photo thumbnail, a video's first frame, or a file tile, opening the
 * file in a new tab; a voice note plays right in its tile.
 */
export function DocumentThumb({
  file,
  onRemove,
  removing = false,
}: {
  readonly file: Attachment;
  readonly onRemove?: (() => void) | undefined;
  readonly removing?: boolean;
}) {
  const t = useTranslations('documents');
  const [videoFailed, setVideoFailed] = useState(false);
  const video = file.contentType.startsWith('video/') && !videoFailed;
  return (
    <li className={TILE}>
      {file.contentType.startsWith('audio/') ? (
        <VoiceNoteThumb id={file.id} name={file.name} />
      ) : (
        <a
          href={documentUrl(file.id)}
          target="_blank"
          rel="noopener"
          title={file.name}
          aria-label={video ? t('media.openVideo', { name: file.name }) : undefined}
          className="flex size-full items-center justify-center"
        >
          {video ? (
            <VideoFrame
              src={documentUrl(file.id)}
              badge="sm"
              onFailed={() => setVideoFailed(true)}
            />
          ) : previewable(file.contentType) ? (
            // biome-ignore lint/performance/noImgElement: authenticated API files cannot go through next/image.
            <img
              src={documentUrl(file.id)}
              alt={file.name}
              loading="lazy"
              className="size-full object-cover transition-transform duration-(--duration-base) group-hover:scale-[1.03]"
            />
          ) : (
            <span className="flex flex-col items-center gap-1.5 px-2 text-center">
              {file.contentType === 'application/pdf' ? (
                <FileText aria-hidden className="size-6 text-accent" />
              ) : (
                <ImageOff aria-hidden className="size-6 text-ink-faint" />
              )}
              <span className="line-clamp-2 type-label break-all text-ink-muted">{file.name}</span>
            </span>
          )}
        </a>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={t('remove', { name: file.name })}
          className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-canvas/90 text-ink shadow-e1 backdrop-blur transition-opacity hover:bg-canvas disabled:opacity-60"
        >
          {removing ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <X aria-hidden className="size-3.5" />
          )}
        </button>
      )}
    </li>
  );
}

export interface PendingUpload {
  readonly key: string;
  readonly file: File;
  readonly preview: string | null;
  readonly progress: number;
  readonly error: string | null;
}

/** A file on its way up: local preview with a progress bar, or the error and a retry. */
export function PendingThumb({
  upload,
  onRetry,
  onDiscard,
}: {
  readonly upload: PendingUpload;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}) {
  const t = useTranslations('documents');
  return (
    <li className={cn(TILE, upload.error && 'ring-overdue/60')}>
      {upload.preview ? (
        // biome-ignore lint/performance/noImgElement: a local object URL preview.
        <img src={upload.preview} alt="" className="size-full object-cover opacity-60" />
      ) : (
        <span className="flex size-full items-center justify-center">
          <FileText aria-hidden className="size-6 text-ink-faint" />
        </span>
      )}
      {upload.error ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-canvas/85 p-2 text-center">
          <span className="line-clamp-3 type-label text-overdue">{upload.error}</span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={onRetry}
              aria-label={t('retry')}
              className="flex size-7 items-center justify-center rounded-full bg-raised text-ink shadow-e1"
            >
              <RotateCw aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onDiscard}
              aria-label={t('discard')}
              className="flex size-7 items-center justify-center rounded-full bg-raised text-ink shadow-e1"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        </span>
      ) : (
        <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-canvas/80">
          <span
            role="progressbar"
            aria-label={t('uploading', { name: upload.file.name })}
            aria-valuenow={Math.round(upload.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="block h-full rounded-full bg-accent transition-[width] duration-(--duration-fast)"
            style={{ width: `${Math.max(6, upload.progress * 100)}%` }}
          />
        </span>
      )}
    </li>
  );
}
