'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { cn, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { Download, ExternalLink, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { describeError } from '@/lib/api/api-error';
import { documentThumbUrl, documentUrl, replaceDocument } from '@/lib/api/upload';
import { previewable } from './document-thumb';

const ACTION =
  'flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-accent';

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One document: what it is, where it came from, and view / download / replace. */
export function DocumentRow({
  document,
  canReplace,
  canDownload,
  onChanged,
}: {
  readonly document: DocumentRecord;
  readonly canReplace: boolean;
  readonly canDownload: boolean;
  readonly onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations('documents');
  const format = useFormatter();
  const toast = useToast();
  const replace = useMutation({
    mutationFn: (file: File) => replaceDocument(document.id, file),
    onSuccess: async () => {
      await onChanged();
      toast({ tone: 'success', title: t('replaced'), description: document.name });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('replaceFailed'), description: describeError(error) }),
  });
  const origin = [
    t(`categories.${document.category}` as 'categories.other'),
    document.taskTitle,
    document.uploadedBy?.fullName,
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sunken ring-1 ring-hairline">
        {previewable(document.contentType) ? (
          // biome-ignore lint/performance/noImgElement: authenticated API files cannot go through next/image.
          <img
            src={documentThumbUrl(document.id)}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <FileText aria-hidden className="size-4.5 text-accent" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate type-body-sm font-medium text-ink" title={document.name}>
          {document.name}
        </p>
        <p className="truncate type-label text-ink-faint">
          {origin.join(' · ')} ·{' '}
          {format.dateTime(new Date(document.createdAt), { day: 'numeric', month: 'short' })} ·{' '}
          {fileSize(document.sizeBytes)}
        </p>
      </div>
      <span className="flex shrink-0 items-center">
        <a href={documentUrl(document.id)} target="_blank" rel="noopener" className={ACTION}>
          <ExternalLink aria-hidden className="size-4" />
          <span className="sr-only">{t('view', { name: document.name })}</span>
        </a>
        {canDownload && (
          <a href={documentUrl(document.id, 'attachment')} className={ACTION}>
            <Download aria-hidden className="size-4" />
            <span className="sr-only">{t('download', { name: document.name })}</span>
          </a>
        )}
        {canReplace && (
          <label
            className={cn(
              ACTION,
              'cursor-pointer focus-within:outline-2 focus-within:outline-focus',
            )}
          >
            {replace.isPending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden className="size-4" />
            )}
            <span className="sr-only">{t('replace', { name: document.name })}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="sr-only"
              disabled={replace.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) replace.mutate(file);
                event.target.value = '';
              }}
            />
          </label>
        )}
      </span>
    </li>
  );
}
