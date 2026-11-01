'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { CheckSquare, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadError } from '@/components/query-state';
import { useDocumentRights } from '../use-document-rights';
import { AddDocumentSheet } from './add-document-sheet';
import { DocumentCard } from './document-card';
import { DEFAULT_FILTERS, type GalleryFilters } from './document-kinds';
import { FolderRail } from './folder-rail';
import { GALLERY_GRID, GalleryEmpty, GalleryNoMatch, GallerySkeleton } from './gallery-states';
import { GalleryToolbar } from './gallery-toolbar';
import { PreviewSheet } from './preview-sheet';
import { SelectionBar } from './selection-bar';
import { type GalleryScope, useGallery } from './use-gallery';
import { useFolderLabel } from './use-labels';

/**
 * Every file of a project or customer as a gallery (PRD 3.14): folders by category with
 * counts, search and type chips, photo thumbnails and paper tiles, a preview sheet with
 * open, download, replace and remove, and an "Add a document" sheet.
 */
export function DocumentsGallery({
  scope,
  bundleName,
}: {
  readonly scope: GalleryScope;
  /** File name for ZIP/PDF downloads, e.g. the project code. */
  readonly bundleName?: string;
}) {
  const t = useTranslations('documents.gallery');
  const folderLabel = useFolderLabel();
  const rights = useDocumentRights();
  const [filters, setFilters] = useState<GalleryFilters>(DEFAULT_FILTERS);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<DocumentRecord | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (document: DocumentRecord) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(document.id)) next.delete(document.id);
      else next.add(document.id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const { query, folders, kinds, shown, total } = useGallery(scope, filters);
  const update = (patch: Partial<GalleryFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));
  const filtered = filters.folder !== 'all' || filters.kind !== 'all' || filters.search !== '';
  const isCustomer = 'customerId' in scope;
  const add = rights.upload ? () => setAdding(true) : null;
  const canBundle = rights.download || rights.print;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl type-body-sm text-ink-muted">
          {t(isCustomer ? 'intro.customer' : 'intro.project')}
        </p>
        <span className="flex flex-wrap gap-2 self-start sm:self-auto">
          {total > 0 && !selecting && canBundle && (
            <Button
              variant="secondary"
              leadingIcon={<CheckSquare aria-hidden />}
              onClick={() => setSelecting(true)}
            >
              {t('select.start')}
            </Button>
          )}
          {add && (
            <Button
              variant="primary"
              leadingIcon={<Plus aria-hidden />}
              onClick={add}
              className="self-start sm:self-auto"
            >
              {t('add')}
            </Button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
        <FolderRail
          value={filters.folder}
          onValueChange={(folder) => update({ folder })}
          folders={folders}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <GalleryToolbar
            search={filters.search}
            onSearchChange={(search) => update({ search })}
            kind={filters.kind}
            onKindChange={(kind) => update({ kind })}
            kinds={kinds}
          />
          {query.isPending && <GallerySkeleton />}
          {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
          {query.data && total === 0 && <GalleryEmpty onAdd={add} />}
          {query.data && total > 0 && shown.length === 0 && (
            <GalleryNoMatch
              search={filters.search}
              folderLabel={filters.folder === 'all' ? null : folderLabel(filters.folder)}
              kindLabel={filters.kind === 'all' ? null : t(`kinds.${filters.kind}`)}
              onReset={() => setFilters(DEFAULT_FILTERS)}
            />
          )}
          <p className="sr-only" aria-live="polite">
            {query.data && filtered ? t('shown', { count: shown.length }) : ''}
          </p>
          {shown.length > 0 && (
            <ul className={GALLERY_GRID}>
              {shown.map((document, index) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  index={index}
                  showProject={isCustomer}
                  onOpen={setOpen}
                  selected={picked.has(document.id)}
                  onToggle={selecting ? toggle : undefined}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      {selecting && (
        <SelectionBar
          ids={[...picked]}
          name={bundleName ?? t('select.defaultName')}
          rights={rights}
          onClear={stopSelecting}
        />
      )}
      <AddDocumentSheet
        scope={scope}
        open={adding}
        onOpenChange={setAdding}
        defaultFolder={filters.folder === 'all' ? null : filters.folder}
      />
      <PreviewSheet document={open} rights={rights} showProject={isCustomer} onChange={setOpen} />
    </div>
  );
}
