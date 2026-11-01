'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { Avatar } from '@oneohm/design-system/web';
import { History } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { swatchFor } from '@/lib/format/contact';
import { FOLDER_ICONS, folderOf } from './document-kinds';
import { useFolderLabel, useRelativeTime } from './use-labels';

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center gap-2 type-body-sm text-ink">{children}</dd>
    </div>
  );
}

function AddedBy({ document }: { readonly document: DocumentRecord }) {
  const t = useTranslations('documents.gallery.preview');
  if (document.source !== 'upload') return <span>{t('oneohm')}</span>;
  if (!document.uploadedBy) return <span className="text-ink-muted">{t('notRecorded')}</span>;
  return (
    <>
      <Avatar
        name={document.uploadedBy.fullName}
        swatch={swatchFor(document.uploadedBy.id)}
        size="sm"
        className="size-6 text-[0.625rem]"
      />
      <span className="truncate">{document.uploadedBy.fullName}</span>
    </>
  );
}

/** Who added the file and when, where it is filed, its name, task and source. */
export function PreviewDetails({
  document,
  showProject,
}: {
  readonly document: DocumentRecord;
  readonly showProject: boolean;
}) {
  const t = useTranslations('documents.gallery');
  const format = useFormatter();
  const relative = useRelativeTime();
  const folderLabel = useFolderLabel();
  const folder = folderOf(document);
  const FolderIcon = FOLDER_ICONS[folder];
  const added = new Date(document.createdAt);
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label={t('preview.addedBy')}>
          <AddedBy document={document} />
        </Detail>
        <Detail label={t('preview.added')}>
          <time
            dateTime={document.createdAt}
            title={format.dateTime(added, { dateStyle: 'medium', timeStyle: 'short' })}
          >
            {relative(document.createdAt)}
          </time>
        </Detail>
        <Detail label={t('preview.folder')}>
          <FolderIcon aria-hidden className="size-4 shrink-0 text-ink-faint" />
          <span className="truncate">{folderLabel(folder)}</span>
        </Detail>
        <Detail label={t('preview.source')}>{t(`sources.${document.source}`)}</Detail>
        <Detail label={t('preview.fileName')}>
          <span className="truncate font-mono text-[0.8125rem]" title={document.name}>
            {document.name}
          </span>
        </Detail>
        {document.taskTitle && (
          <Detail label={t('preview.task')}>
            <span className="truncate">{document.taskTitle}</span>
          </Detail>
        )}
        {showProject && document.projectId && document.projectCode && (
          <Detail label={t('preview.project')}>
            <Link
              href={`/projects/${document.projectId}`}
              className="font-mono text-[0.8125rem] text-accent hover:underline"
            >
              {document.projectCode}
            </Link>
          </Detail>
        )}
      </dl>
      {document.replaced && (
        <p className="flex items-start gap-2 type-body-sm text-ink-muted">
          <History aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          {t('preview.replacedNote')}
        </p>
      )}
    </div>
  );
}
