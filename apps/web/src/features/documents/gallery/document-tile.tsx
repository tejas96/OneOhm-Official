'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import {
  File,
  FileAudio,
  FileCheck,
  FileImage,
  FileText,
  FileVideo,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { documentThumbUrl, documentUrl } from '@/lib/api/upload';
import { extensionOf, isVideo, kindLabelOf, showsInline } from './document-kinds';
import { VideoFrame } from './video-frame';

const ICONS: Readonly<Record<ReturnType<typeof kindLabelOf>, LucideIcon>> = {
  image: FileImage,
  pdf: FileText,
  audio: FileAudio,
  video: FileVideo,
  other: File,
};

function iconFor(document: DocumentRecord): LucideIcon {
  const label = kindLabelOf(document.contentType);
  if (label === 'pdf' && document.source !== 'upload') return FileCheck;
  return ICONS[label];
}

/** A calm paper tile: the kind's glyph and the extension, like a label on a file. */
export function PaperTile({
  document,
  className,
  large = false,
}: {
  readonly document: DocumentRecord;
  readonly className?: string;
  readonly large?: boolean;
}) {
  const Icon = iconFor(document);
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-full items-center justify-center bg-sunken text-ink-faint',
        className,
      )}
    >
      <Icon className={cn('stroke-[1.25]', large ? 'size-14' : 'size-9')} />
      <span className="absolute right-2 bottom-2 rounded-sm border border-rule bg-raised px-1.5 py-0.5 font-mono text-[0.6875rem] tracking-wide text-ink-muted">
        {extensionOf(document.name)}
      </span>
    </span>
  );
}

/**
 * The preview area of a document card: the photo itself (loaded lazily through the
 * access-checked file route), a video's first frame, or the paper tile when the browser
 * cannot show it (voice notes, HEIC, PDFs).
 */
export function DocumentTile({
  document,
  className,
}: {
  readonly document: DocumentRecord;
  readonly className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (isVideo(document.contentType) && !failed) {
    return (
      <VideoFrame
        src={documentUrl(document.id)}
        onFailed={() => setFailed(true)}
        {...(className ? { className } : {})}
      />
    );
  }
  if (!showsInline(document.contentType) || failed) {
    return <PaperTile document={document} {...(className ? { className } : {})} />;
  }
  return (
    // biome-ignore lint/performance/noImgElement: authenticated API files cannot go through next/image.
    <img
      src={documentThumbUrl(document.id)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('size-full bg-sunken object-cover', className)}
    />
  );
}
