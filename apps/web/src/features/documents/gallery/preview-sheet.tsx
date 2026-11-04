'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { Button, Sheet } from '@oneohm/design-system/web';
import { ArrowRightLeft, Download, ExternalLink, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { printDocument } from '@/lib/api/print';
import { documentUrl } from '@/lib/api/upload';
import { fileSize } from '../document-row';
import type { DocumentRights } from '../use-document-rights';
import { folderOf, kindOf, titleOf } from './document-kinds';
import { ACCEPT } from './file-drop-zone';
import { MoveSheet } from './move-sheet';
import { PreviewDetails } from './preview-details';
import { PreviewMedia } from './preview-media';
import { UploadProgress } from './upload-progress';
import { useRemoveDocument, useReplaceDocument } from './use-document-actions';
import { useFolderLabel, useKindLabel } from './use-labels';

/** A customer's paper (not a task's file) may go to another home or kind. */
const canMove = (rights: DocumentRights, document: DocumentRecord | null) =>
  rights.upload && Boolean(document?.customerId) && !document?.taskId;

/**
 * A document opened from the gallery: a large preview, the details, open, print and
 * download (each by right), move / change kind for a customer's paper, and for managers
 * replace and remove with a confirmation.
 */
export function PreviewSheet({
  document,
  rights,
  showProject,
  onChange,
}: {
  readonly document: DocumentRecord | null;
  readonly rights: DocumentRights;
  readonly showProject: boolean;
  /** The sheet now shows another record (a replacement) or nothing. */
  readonly onChange: (document: DocumentRecord | null) => void;
}) {
  const t = useTranslations('documents.gallery.preview');
  const folderLabel = useFolderLabel();
  const kindLabel = useKindLabel();
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState(false);
  // Keep the last document while the sheet slides away, so its content does not blank out.
  const [kept, setKept] = useState<DocumentRecord | null>(document);
  if (document && document !== kept) setKept(document);
  const close = () => {
    setConfirming(false);
    onChange(null);
  };
  const replace = useReplaceDocument((next) => onChange(next));
  const remove = useRemoveDocument(close);
  const shown = document ?? kept;
  const movable = canMove(rights, shown);

  const confirmFooter = shown && (
    <>
      <Button variant="quiet" onClick={() => setConfirming(false)}>
        {t('confirm.keep')}
      </Button>
      <Button variant="danger" pending={remove.isPending} onClick={() => remove.mutate(shown)}>
        {t('confirm.remove')}
      </Button>
    </>
  );
  const footer = shown && (
    // Phones: open and download first, two to a row; wider screens: one row, remove apart.
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
      {rights.manage && (
        <>
          <Button
            variant="quiet"
            leadingIcon={<Trash2 aria-hidden />}
            onClick={() => setConfirming(true)}
            disabled={replace.isPending}
            className="order-3 sm:order-none sm:mr-auto"
          >
            {t('remove')}
          </Button>
          <Button
            asChild
            variant="secondary"
            aria-disabled={replace.isPending || undefined}
            className="order-4 sm:order-none"
          >
            <label className="cursor-pointer focus-within:outline-2 focus-within:outline-focus">
              <RefreshCw aria-hidden className="size-4" />
              {t('replace')}
              <input
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={replace.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) replace.mutate({ id: shown.id, file });
                }}
              />
            </label>
          </Button>
        </>
      )}
      {movable && (
        <Button
          variant="secondary"
          leadingIcon={<ArrowRightLeft aria-hidden />}
          onClick={() => setMoving(true)}
          className="order-5 sm:order-none"
        >
          {t('move')}
        </Button>
      )}
      {rights.print && kindOf(shown.contentType) !== 'media' && (
        <Button
          variant="secondary"
          leadingIcon={<Printer aria-hidden />}
          onClick={() => printDocument(shown.id)}
          className="order-1 sm:order-none"
        >
          {t('print')}
        </Button>
      )}
      {rights.download && (
        <Button asChild variant="secondary" className="order-1 sm:order-none">
          <a href={documentUrl(shown.id, 'attachment')} download={shown.name}>
            <Download aria-hidden className="size-4" />
            {t('download')}
          </a>
        </Button>
      )}
      <Button asChild variant="primary" className="order-2 sm:order-none">
        <a href={documentUrl(shown.id)} target="_blank" rel="noopener">
          <ExternalLink aria-hidden className="size-4" />
          {t('openFull')}
        </a>
      </Button>
    </div>
  );

  return (
    <>
      <Sheet
        open={document !== null}
        onOpenChange={(open) => !open && close()}
        width="lg"
        title={shown ? titleOf(shown.name) : ''}
        description={
          shown
            ? t('description', {
                folder: folderLabel(folderOf(shown)),
                kind: kindLabel(shown),
                size: fileSize(shown.sizeBytes),
              })
            : undefined
        }
        footer={confirming ? confirmFooter : footer}
      >
        {shown && (
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <PreviewMedia key={shown.id} document={shown} />
            {replace.isPending && (
              <UploadProgress
                percent={replace.percent}
                label={t('replacing', { percent: replace.percent })}
              />
            )}
            {confirming ? (
              <div className="flex flex-col gap-3 rounded-lg border border-overdue-solid/30 bg-overdue-tint/40 p-4">
                <p className="type-body-sm text-ink">{t('confirm.body')}</p>
              </div>
            ) : (
              <PreviewDetails document={shown} showProject={showProject} />
            )}
          </div>
        )}
      </Sheet>
      <MoveSheet
        document={moving && document ? document : null}
        onClose={() => setMoving(false)}
        onMoved={(moved) => onChange(moved)}
      />
    </>
  );
}
