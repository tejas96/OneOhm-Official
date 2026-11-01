'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Camera, Paperclip } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** On a task card: how many files are attached and whether a site photo is still needed. */
export function TaskEvidenceLine({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('documents.evidence');
  const needsPhoto = task.missingEvidence.includes('photo');
  if (task.attachments.length === 0 && !needsPhoto) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 type-body-sm text-ink-faint">
      {task.attachments.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <Paperclip aria-hidden className="size-3.5" />
          {t('files', { count: task.attachments.length })}
        </span>
      )}
      {needsPhoto && task.status !== 'pending' && (
        <span className="inline-flex items-center gap-1.5 text-at-risk">
          <Camera aria-hidden className="size-3.5" />
          {t('photoNeeded')}
        </span>
      )}
    </p>
  );
}
