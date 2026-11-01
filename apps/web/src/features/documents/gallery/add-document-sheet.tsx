'use client';

import { Button, Field, Input, Select, Sheet } from '@oneohm/design-system/web';
import {
  ACCEPTED_FILE_TYPES,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  MAX_UPLOAD_BYTES,
} from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { fileSize } from '../document-row';
import { FOLDER_ICONS, titleOf } from './document-kinds';
import { FileDropZone } from './file-drop-zone';
import { UploadProgress } from './upload-progress';
import { useAddDocument } from './use-document-actions';
import type { GalleryScope } from './use-gallery';
import { useFolderLabel } from './use-labels';

/** The browser's guess at the type; HEIC often arrives without one, so its name decides. */
function acceptable(file: File): boolean {
  if ((ACCEPTED_FILE_TYPES as readonly string[]).includes(file.type)) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

/**
 * Add a document: choose or drop one file, name it and file it in a folder. The server
 * checks the file's real type and size; the obvious mistakes are caught here first.
 */
export function AddDocumentSheet({
  scope,
  open,
  onOpenChange,
  defaultFolder,
}: {
  readonly scope: GalleryScope;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The folder being browsed, when it is not "All documents". */
  readonly defaultFolder: DocumentCategory | null;
}) {
  const t = useTranslations('documents.gallery.upload');
  const tGallery = useTranslations('documents.gallery');
  const folderLabel = useFolderLabel();
  const upload = useAddDocument(scope);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<DocumentCategory>(defaultFolder ?? 'other');
  const [folderTouched, setFolderTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setFile(null);
    setTitle('');
    setFolder(defaultFolder ?? 'other');
    setFolderTouched(false);
    setError(null);
    upload.reset();
  };
  const choose = (chosen: File) => {
    upload.reset();
    if (!acceptable(chosen)) {
      setError(t('errors.type'));
      return;
    }
    if (chosen.size > MAX_UPLOAD_BYTES) {
      setError(t('errors.size', { size: fileSize(chosen.size) }));
      return;
    }
    setError(null);
    setFile(chosen);
    if (!title.trim()) setTitle(titleOf(chosen.name));
    if (!defaultFolder && !folderTouched && chosen.type.startsWith('image/')) {
      setFolder('site_photo');
    }
  };
  const submit = () => {
    if (!file) {
      setError(t('errors.missing'));
      return;
    }
    upload.mutate(
      { file, title: title.trim(), category: folder },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };
  const failure = upload.isError
    ? t('errors.failed', { reason: describeError(upload.error) })
    : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (upload.isPending) return;
        if (next) setFolder(defaultFolder ?? 'other');
        else reset();
        onOpenChange(next);
      }}
      title={tGallery('add')}
      description={t('description')}
      footer={
        <>
          <Button variant="quiet" disabled={upload.isPending} onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button variant="primary" pending={upload.isPending} onClick={submit}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        <Field label={t('file')} error={error ?? failure} required>
          <FileDropZone file={file} onFile={choose} disabled={upload.isPending} />
        </Field>
        {upload.isPending && (
          <UploadProgress
            percent={upload.percent}
            label={t('progress', { percent: upload.percent })}
          />
        )}
        <Field label={t('title')} hint={t('titleHint')}>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={150}
            disabled={upload.isPending}
          />
        </Field>
        <Field label={t('folder')}>
          <Select
            value={folder}
            disabled={upload.isPending}
            onValueChange={(next) => {
              setFolder(next);
              setFolderTouched(true);
            }}
            options={DOCUMENT_CATEGORIES.map((value) => {
              const Icon = FOLDER_ICONS[value];
              return { value, label: folderLabel(value), icon: <Icon aria-hidden /> };
            })}
          />
        </Field>
      </div>
    </Sheet>
  );
}
