'use client';

import type { DocumentRecord, MoveDocument } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import type { DocumentCategory } from '@oneohm/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { replaceDocument, uploadDocument } from '@/lib/api/upload';
import { titleOf } from './document-kinds';
import { type GalleryScope, useRefreshDocuments } from './use-gallery';

export interface NewDocument {
  readonly file: File;
  readonly title: string;
  readonly category: DocumentCategory;
}

/** Uploads one file into the scope, reporting progress as a whole percent. */
export function useAddDocument(scope: GalleryScope) {
  const t = useTranslations('documents.gallery.upload');
  const toast = useToast();
  const refresh = useRefreshDocuments();
  const [percent, setPercent] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ file, title, category }: NewDocument) =>
      uploadDocument(file, { category, ...scope, ...(title ? { name: title } : {}) }, (part) =>
        setPercent(Math.round(part * 100)),
      ),
    onMutate: () => setPercent(0),
    onSuccess: async (document) => {
      await refresh();
      toast({ tone: 'success', title: t('added'), description: titleOf(document.name) });
    },
  });
  return { ...mutation, percent };
}

/** Replaces a document's file; resolves with the new record (the old one leaves the list). */
export function useReplaceDocument(onReplaced: (document: DocumentRecord) => void) {
  const t = useTranslations('documents');
  const toast = useToast();
  const refresh = useRefreshDocuments();
  const [percent, setPercent] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ id, file }: { readonly id: string; readonly file: File }) =>
      replaceDocument(id, file, (part) => setPercent(Math.round(part * 100))),
    onMutate: () => setPercent(0),
    onSuccess: async (document) => {
      await refresh();
      onReplaced(document);
      toast({ tone: 'success', title: t('replaced'), description: titleOf(document.name) });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('replaceFailed'), description: describeError(error) }),
  });
  return { ...mutation, percent };
}

/** Takes a document off its project or customer; it stays in the audit trail. */
export function useRemoveDocument(onRemoved: () => void) {
  const t = useTranslations('documents.gallery.preview');
  const toast = useToast();
  const refresh = useRefreshDocuments();
  return useMutation({
    mutationFn: (document: DocumentRecord) =>
      expectStatus(api.documents.removeDocument({ params: { id: document.id } }), 204),
    onSuccess: async (_, document) => {
      onRemoved();
      await refresh();
      toast({ tone: 'success', title: t('removed'), description: titleOf(document.name) });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('removeFailed'), description: describeError(error) }),
  });
}

/**
 * Files the paper on another home or kind. Requests and checklists of every project may
 * change (a request it answered is asked again), so they are read again.
 */
export function useMoveDocument(onMoved: (document: DocumentRecord) => void) {
  const t = useTranslations('documents.gallery.move');
  const toast = useToast();
  const client = useQueryClient();
  const refresh = useRefreshDocuments();
  return useMutation({
    mutationFn: ({ id, body }: { readonly id: string; readonly body: MoveDocument }) =>
      expectStatus(api.documents.moveDocument({ params: { id }, body }), 200),
    onSuccess: async (document) => {
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['projects'] })]);
      onMoved(document);
      toast({ tone: 'success', title: t('moved'), description: titleOf(document.name) });
    },
  });
}
