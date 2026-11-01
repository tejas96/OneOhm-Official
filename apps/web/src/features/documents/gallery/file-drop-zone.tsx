'use client';

import { cn, useField } from '@oneohm/design-system/web';
import { FileUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type DragEvent, useRef, useState } from 'react';
import { fileSize } from '../document-row';

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf';

/**
 * One file, chosen with the picker or dropped. Lives inside a Field, so the field's
 * label names it and its hint and error describe it.
 */
export function FileDropZone({
  file,
  onFile,
  disabled = false,
}: {
  readonly file: File | null;
  readonly onFile: (file: File) => void;
  readonly disabled?: boolean;
}) {
  const t = useTranslations('documents.gallery.upload');
  const field = useField();
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !disabled) onFile(dropped);
  };
  return (
    <>
      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = '';
          if (chosen) onFile(chosen);
        }}
      />
      <button
        id={field?.id}
        type="button"
        disabled={disabled}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        onClick={() => picker.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center',
          'transition-colors duration-(--duration-fast) aria-invalid:border-overdue disabled:opacity-60',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          dragging
            ? 'border-accent bg-accent-soft/50'
            : 'border-rule bg-sunken/50 hover:border-ink-faint',
        )}
      >
        <FileUp aria-hidden className="size-6 text-ink-faint" />
        {file ? (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="break-all type-body-sm font-medium text-ink">{file.name}</span>
            <span className="type-body-sm text-ink-faint">
              {t('chooseAnother', { size: fileSize(file.size) })}
            </span>
          </span>
        ) : (
          <span className="flex flex-col gap-0.5">
            <span className="type-body-sm font-medium text-ink">{t('choose')}</span>
            <span className="type-body-sm text-ink-faint">{t('accepted')}</span>
          </span>
        )}
      </button>
    </>
  );
}
