'use client';

import { useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { DocumentsGallery } from './gallery/documents-gallery';
import type { GalleryScope } from './gallery/use-gallery';

/**
 * A party's own papers (PRD 3.13, 3.14) on its page: a contractor's agreement, licence
 * and work orders, a vendor's certificates, a lead's bill and ID. Upload, preview,
 * download and print follow the same document rights as everywhere else.
 */
export function PapersSection({
  scope,
  name,
  allowUpload = true,
  uploadHint,
}: {
  readonly scope: Exclude<GalleryScope, { readonly projectId: string }>;
  /** File name for ZIP and combined PDF downloads. */
  readonly name: string;
  /** False hides the Add control; `uploadHint` then says why. */
  readonly allowUpload?: boolean;
  readonly uploadHint?: string;
}) {
  const t = useTranslations('documents');
  const canView = useCan('documents.view');
  if (!canView) return null;
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h2 className="type-title-lg text-ink [font-family:var(--font-display)]">{t('title')}</h2>
      {!allowUpload && uploadHint && <p className="type-body-sm text-ink-muted">{uploadHint}</p>}
      <DocumentsGallery scope={scope} bundleName={name} allowUpload={allowUpload} />
    </section>
  );
}
