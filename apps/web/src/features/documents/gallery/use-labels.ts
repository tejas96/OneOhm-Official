'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { fileSize } from '../document-row';
import { type FolderChoice, kindOf } from './document-kinds';

/** "All documents", "Site photo", "DISCOM"… */
export function useFolderLabel() {
  const t = useTranslations('documents');
  return (folder: FolderChoice) =>
    folder === 'all' ? t('gallery.allDocuments') : t(`categories.${folder}`);
}

/** "Photo", "PDF" or "File". */
export function useKindLabel() {
  const t = useTranslations('documents.gallery.kindLabels');
  return (document: DocumentRecord) => t(kindOf(document.contentType));
}

/** "Photo · 3 KB", "PDF · 1.2 MB". */
export function useKindAndSize() {
  const t = useTranslations('documents.gallery.card');
  const kindLabel = useKindLabel();
  return (document: DocumentRecord) =>
    t('meta', { kind: kindLabel(document), size: fileSize(document.sizeBytes) });
}

/**
 * "2 days ago". A file added a moment ago can carry a server time slightly ahead of the
 * page clock; it reads "now" rather than "in 3 seconds".
 */
export function useRelativeTime() {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return (instant: string) => {
    const at = new Date(instant);
    return format.relativeTime(at, at > now ? at : now);
  };
}

/** "OneOhm Admin, 2 days ago", or OneOhm itself for reports and system files. */
export function useAddedLine() {
  const t = useTranslations('documents.gallery.card');
  const relative = useRelativeTime();
  return (document: DocumentRecord) => {
    const time = relative(document.createdAt);
    if (document.source !== 'upload') return t('madeBy', { time });
    if (document.uploadedBy) return t('addedBy', { name: document.uploadedBy.fullName, time });
    return t('added', { time });
  };
}
