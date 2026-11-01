'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { StatusPill, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { Camera, Paperclip } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useInvalidateWork } from '@/features/projects/tasks/use-task-actions';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { DocumentThumb, PendingThumb } from './document-thumb';
import { useUploads } from './use-uploads';

const PICK =
  'flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-rule bg-surface/60 px-2 text-center type-label text-ink-muted transition-colors hover:border-accent hover:text-accent focus-within:outline-2 focus-within:outline-focus';

/**
 * Photos and files for one task, uploaded as soon as they are picked (PRD 4.4: a task
 * that needs photos completes only once one is uploaded).
 */
export function EvidenceUploader({
  task,
  onBusyChange,
}: {
  readonly task: ProjectTask;
  readonly onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations('documents.evidence');
  const toast = useToast();
  const invalidate = useInvalidateWork();
  const needsPhoto = task.missingEvidence.includes('photo');
  const wantsPhoto = task.evidence.includes('photo');
  const uploads = useUploads(
    { category: wantsPhoto ? 'site_photo' : 'other', taskId: task.id },
    invalidate,
  );
  const remove = useMutation({
    mutationFn: (id: string) => expectStatus(api.documents.removeDocument({ params: { id } }), 204),
    onSuccess: () => invalidate(),
    onError: (error) =>
      toast({ tone: 'error', title: t('removeFailed'), description: describeError(error) }),
  });
  const editable = task.status !== 'completed';
  useEffect(() => onBusyChange?.(uploads.busy), [onBusyChange, uploads.busy]);

  return (
    <section className="flex flex-col gap-3" aria-label={t('title')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-overline text-ink-faint uppercase">{t('title')}</p>
        {wantsPhoto && (
          <StatusPill
            size="sm"
            tone={needsPhoto ? 'atRisk' : 'done'}
            label={needsPhoto ? t('photoNeeded') : t('photoAdded')}
          />
        )}
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {task.attachments.map((file) => (
          <DocumentThumb
            key={file.id}
            file={file}
            removing={remove.isPending && remove.variables === file.id}
            onRemove={editable ? () => remove.mutate(file.id) : undefined}
          />
        ))}
        {uploads.pending.map((upload) => (
          <PendingThumb
            key={upload.key}
            upload={upload}
            onRetry={() => uploads.retry(upload.key)}
            onDiscard={() => uploads.discard(upload.key)}
          />
        ))}
        {editable && (
          <>
            <li className="sm:hidden">
              <label className={PICK}>
                <Camera aria-hidden className="size-5" />
                {t('takePhoto')}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    uploads.add(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
            </li>
            <li>
              <label className={PICK}>
                <Paperclip aria-hidden className="size-5" />
                {t('addFiles')}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="sr-only"
                  onChange={(event) => {
                    uploads.add(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
            </li>
          </>
        )}
      </ul>
      <p className="type-label text-ink-faint">{t('hint')}</p>
    </section>
  );
}
