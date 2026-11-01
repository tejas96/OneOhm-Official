'use client';

import { useCan } from '@/providers/current-user';

/** What the signed-in person may do with documents (PRD 3.14). Manage covers every right. */
export interface DocumentRights {
  readonly upload: boolean;
  readonly download: boolean;
  readonly print: boolean;
  readonly manage: boolean;
}

export function useDocumentRights(): DocumentRights {
  return {
    upload: useCan('documents.upload', 'documents.manage'),
    download: useCan('documents.download', 'documents.manage'),
    print: useCan('documents.print', 'documents.manage'),
    manage: useCan('documents.manage'),
  };
}
