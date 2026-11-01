'use client';

import { Button, EmptyState, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { FolderOpen, Plus, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Two columns on phones, three on tablets, four on wide screens. */
export const GALLERY_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4';

/** Card-shaped placeholders while the list loads (shown only after 300 ms). */
export function GallerySkeleton() {
  const t = useTranslations('documents.gallery');
  return (
    <SkeletonGroup label={t('loading')}>
      <div className={GALLERY_GRID}>
        {['a', 'b', 'c', 'd', 'e', 'f'].map((card) => (
          <div
            key={card}
            className="flex flex-col overflow-hidden rounded-lg border border-hairline bg-raised"
          >
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** Nothing filed yet: what belongs here, and the way to add the first one. */
export function GalleryEmpty({ onAdd }: { readonly onAdd: (() => void) | null }) {
  const t = useTranslations('documents.gallery');
  return (
    <EmptyState
      icon={<FolderOpen />}
      title={t('empty.title')}
      description={onAdd ? t('empty.description') : t('empty.readOnly')}
      {...(onAdd
        ? {
            action: (
              <Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={onAdd}>
                {t('addFirst')}
              </Button>
            ),
          }
        : {})}
    />
  );
}

/** The filters hide everything: say which, and offer the way back. */
export function GalleryNoMatch({
  search,
  folderLabel,
  kindLabel,
  onReset,
}: {
  readonly search: string;
  /** The chosen folder's name, or null when every folder is shown. */
  readonly folderLabel: string | null;
  /** The chosen type chip ("PDFs"), or null for all kinds. */
  readonly kindLabel: string | null;
  readonly onReset: () => void;
}) {
  const t = useTranslations('documents.gallery.noMatch');
  let title = t('kind', { kind: kindLabel ?? '' });
  if (search.trim()) title = t('search', { search: search.trim() });
  else if (folderLabel) title = t('folder', { folder: folderLabel });
  return (
    <EmptyState
      icon={<SearchX />}
      title={title}
      description={t('description')}
      action={
        <Button variant="quiet" size="sm" onClick={onReset}>
          {t('reset')}
        </Button>
      }
    />
  );
}
