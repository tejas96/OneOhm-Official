'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@oneohm/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useMemo } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { documentsQueryKey } from '../documents-panel';
import {
  type DocumentKind,
  type FolderChoice,
  folderOf,
  type GalleryFilters,
  kindOf,
  matchesSearchAndKind,
} from './document-kinds';

export type GalleryScope = { readonly projectId: string } | { readonly customerId: string };

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
    const rest = { kind: filters.kind, search };
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
    return { folders, kinds, shown, total: documents.length };
  }, [all, filters.folder, filters.kind, search]);

  return { query, ...derived };
}
