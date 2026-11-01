'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@oneohm/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useMemo } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { type DocumentScope, documentsQueryKey } from '../documents-panel';
import {
  type DocumentKind,
  type FolderChoice,
  folderOf,
  type GalleryFilters,
  kindOf,
  matchesSearchAndKind,
} from './document-kinds';
import { uploadersOf } from './gallery-filters';

export type GalleryScope = DocumentScope;
export type ScopeKind = 'project' | 'customer' | 'lead' | 'contractor' | 'vendor';

/** Whose gallery this is, for its intro line and the folder new files go in. */
export function scopeKindOf(scope: GalleryScope): ScopeKind {
  if ('projectId' in scope) return 'project';
  if ('customerId' in scope) return 'customer';
  if ('leadId' in scope) return 'lead';
  return 'contractorId' in scope ? 'contractor' : 'vendor';
}

/** A contractor's or vendor's papers start in their own folder. */
export const SCOPE_FOLDER: Readonly<Partial<Record<ScopeKind, DocumentCategory>>> = {
  contractor: 'contractor',
  vendor: 'vendor',
};

export interface FolderEntry {
  readonly folder: FolderChoice;
  /** Files in the folder that match the search and type chip. */
  readonly count: number;
}

/** Refreshes every document list (gallery and panel) and the project page around it. */
export function useRefreshDocuments() {
  const client = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['documents'] }),
        client.invalidateQueries({ queryKey: ['project'] }),
      ]),
    [client],
  );
}

/**
 * The scope's documents, filtered in the browser (the list is one request): folders
 * with counts that follow the search, the kinds present, and the files to show.
 */
export function useGallery(scope: GalleryScope, filters: GalleryFilters) {
  const query = useQuery({
    queryKey: documentsQueryKey(scope),
    queryFn: () => expectStatus(api.documents.listDocuments({ query: scope }), 200),
  });
  const search = useDeferredValue(filters.search);
  const all = query.data;

  const derived = useMemo(() => {
    const documents: readonly DocumentRecord[] = all ?? [];
    const { folder: _folder, ...others } = filters;
    const rest = { ...others, search };
    const matching = documents.filter((document) => matchesSearchAndKind(document, rest));
    const present = new Set<DocumentCategory>(documents.map(folderOf));
    if (filters.folder !== 'all') present.add(filters.folder);
    const folders: FolderEntry[] = [
      { folder: 'all', count: matching.length },
      ...DOCUMENT_CATEGORIES.filter((category) => present.has(category)).map((folder) => ({
        folder,
        count: matching.filter((document) => folderOf(document) === folder).length,
      })),
    ];
    const kinds = new Set<DocumentKind>(documents.map((document) => kindOf(document.contentType)));
    const shown =
      filters.folder === 'all'
        ? matching
        : matching.filter((document) => folderOf(document) === filters.folder);
    return { folders, kinds, shown, total: documents.length, uploaders: uploadersOf(documents) };
  }, [all, filters, search]);

  return { query, ...derived };
}
