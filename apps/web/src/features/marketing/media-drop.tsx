'use client';

import { Button, cn, ProgressRing } from '@oneohm/design-system/web';
import { CircleAlert, ImagePlus, RefreshCw, Video } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { MEDIA_ACCEPT, mediaKindOfFile, uploadMarketingMedia } from './upload-media';

export interface PickedMedia {
  readonly id: string | null;
  readonly kind: 'image' | 'video' | null;
}

/**
 * A big, friendly place to put the photo or video: tap or drag. Upload starts at once with a
 * progress ring; once done the picture stays as a preview with a Replace button.
 */
export function MediaDrop({
  onChange,
  onUploading,
  onPreview,
}: {
  readonly onChange: (media: PickedMedia) => void;
  readonly onUploading: (uploading: boolean) => void;
  /** The picked file's local address, for the live ad preview; null when cleared. */
  readonly onPreview: (url: string | null) => void;
}) {
  const t = useTranslations('marketing');
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const take = (file: File | undefined) => {
    if (!file) return;
    const kind = mediaKindOfFile(file);
    if (!kind) {
      setError(t('media.wrongType'));
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    setPreview({ url, kind });
    onPreview(url);
    setProgress(0);
    onUploading(true);
    onChange({ id: null, kind: null });
    uploadMarketingMedia(file, setProgress)
      .then((media) => onChange({ id: media.id, kind: media.kind }))
      .catch((caught: unknown) => {
        setError(describeError(caught));
        setPreview(null);
        onPreview(null);
      })
      .finally(() => {
        setProgress(null);
        onUploading(false);
      });
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept={MEDIA_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={t('media.pick')}
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <motion.button
        type="button"
        layout
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files[0]);
        }}
        className={cn(
          'relative flex min-h-44 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed bg-raised p-4 text-center outline-offset-2 transition-colors',
          over ? 'border-accent bg-accent-soft' : 'border-rule hover:border-accent',
        )}
      >
        {preview ? (
          <>
            {preview.kind === 'image' ? (
              // biome-ignore lint/performance/noImgElement: a local preview of the picked file
              <img
                src={preview.url}
                alt={t('media.previewAlt')}
                className="max-h-60 rounded-lg object-contain"
              />
            ) : (
              <video src={preview.url} muted playsInline className="max-h-60 rounded-lg" />
            )}
            {progress !== null && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-scrim/60">
                <ProgressRing value={progress} label={t('media.uploading')} size={56} paint="brand">
                  <span className="type-body-sm text-on-panel tabular-nums">
                    {Math.round(progress * 100)}
                  </span>
                </ProgressRing>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent [&_svg]:size-6">
              <ImagePlus aria-hidden />
            </span>
            <span className="type-title-md text-ink">{t('media.title')}</span>
            <span className="flex items-center gap-1.5 type-body-sm text-ink-muted">
              <Video aria-hidden className="size-3.5" />
              {t('media.hint')}
            </span>
          </>
        )}
      </motion.button>
      {preview && progress === null && (
        <Button
          size="sm"
          variant="quiet"
          className="self-start"
          leadingIcon={<RefreshCw />}
          onClick={() => input.current?.click()}
        >
          {t('media.replace')}
        </Button>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 type-body-sm text-overdue">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
