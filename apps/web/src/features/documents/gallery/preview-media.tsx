'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { Skeleton } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { documentThumbUrl, documentUrl } from '@/lib/api/upload';
import { kindOf, showsInline, titleOf } from './document-kinds';
import { PaperTile } from './document-tile';
import { PreviewPlayback } from './preview-playback';

const WIDE = '(min-width: 640px)';

/**
 * The PDF as a local blob URL. The file route forbids framing (it is an API response),
 * so the bytes are fetched once and handed to the browser's own PDF viewer. Phones and
 * browsers without a viewer get the paper tile instead.
 */
function usePdfUrl(document: DocumentRecord) {
  const wanted = kindOf(document.contentType) === 'pdf';
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });
  useEffect(() => {
    setState({ url: null, failed: false });
    if (!wanted) return;
    if (!window.matchMedia(WIDE).matches || navigator.pdfViewerEnabled === false) {
      setState({ url: null, failed: true });
      return;
    }
    let active = true;
    let created: string | null = null;
    fetch(documentUrl(document.id), { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setState({ url: created, failed: false });
      })
      .catch(() => {
        if (active) setState({ url: null, failed: true });
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [document.id, wanted]);
  return state;
}

/** The large preview at the top of the sheet: the photo, the PDF, the player, or a tile. */
export function PreviewMedia({ document }: { readonly document: DocumentRecord }) {
  const t = useTranslations('documents.gallery.preview');
  const pdf = usePdfUrl(document);
  const [imageFailed, setImageFailed] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  const isPdf = kindOf(document.contentType) === 'pdf';
  let body: ReactNode;
  if (kindOf(document.contentType) === 'media' && !playFailed) {
    body = <PreviewPlayback document={document} onFailed={() => setPlayFailed(true)} />;
  } else if (showsInline(document.contentType) && !imageFailed) {
    body = (
      // biome-ignore lint/performance/noImgElement: authenticated API files cannot go through next/image.
      <img
        src={documentUrl(document.id)}
        alt={titleOf(document.name)}
        onError={() => setImageFailed(true)}
        // The small preview (already loaded by the gallery) shows until the original arrives.
        style={{ backgroundImage: `url(${documentThumbUrl(document.id)})` }}
        className="max-h-[55dvh] min-h-48 w-full bg-sunken bg-contain bg-center bg-no-repeat object-contain"
      />
    );
  } else if (isPdf && pdf.url) {
    body = (
      <iframe src={pdf.url} title={titleOf(document.name)} className="h-[52dvh] w-full bg-sunken" />
    );
  } else if (isPdf && !pdf.failed) {
    body = (
      <div role="status" className="h-[52dvh] w-full">
        <span className="sr-only">{t('pdfLoading')}</span>
        <Skeleton className="size-full rounded-none" />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col">
        <div className="aspect-[16/9]">
          <PaperTile document={document} large />
        </div>
        <p className="border-t border-hairline bg-raised px-4 py-3 type-body-sm text-ink-muted">
          {t('noInline')}
        </p>
      </div>
    );
  }
  return <div className="overflow-hidden rounded-lg border border-hairline">{body}</div>;
}
