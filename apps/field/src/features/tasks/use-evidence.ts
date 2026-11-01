import type { DocumentRecord, ProjectTask } from '@oneohm/api-contracts';
import { describeError, type UploadableFile, unwrap, uploadFile } from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { API_BASE_URL, api, currentToken, keys } from '@/api/api';

/** A photo picked on this phone: uploading, or failed and waiting for a retry. */
export interface PendingPhoto {
  readonly id: string;
  readonly file: UploadableFile;
  readonly progress: number;
  readonly error: string | null;
}

let sequence = 0;

/**
 * Site photos for one task. Each photo uploads as soon as it is picked (with progress);
 * a failed one stays on screen with a retry. Uploaded photos come back as the task's
 * attachments, so the server stays the one record of what is attached.
 */
export function useEvidence(task: ProjectTask) {
  const client = useQueryClient();
  const [pending, setPending] = useState<readonly PendingPhoto[]>([]);
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: keys.task(task.id) });
    await client.invalidateQueries({ queryKey: keys.tasks });
  }, [client, task.id]);

  const patch = (id: string, change: Partial<PendingPhoto>) =>
    setPending((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...change } : photo)),
    );

  const send = (photo: PendingPhoto) => {
    patch(photo.id, { progress: 0, error: null });
    uploadFile<DocumentRecord>({
      url: `${API_BASE_URL.replace(/\/+$/, '')}/v1/documents`,
      token: currentToken(),
      file: photo.file,
      fields: { category: 'site_photo', taskId: task.id, name: photo.file.name },
      onProgress: (fraction) => patch(photo.id, { progress: fraction }),
    })
      .then(async () => {
        await refresh();
        setPending((current) => current.filter((item) => item.id !== photo.id));
      })
      .catch((error: unknown) => patch(photo.id, { error: describeError(error) }));
  };

  const add = (files: readonly UploadableFile[]) => {
    const added = files.map((file) => {
      sequence += 1;
      return { id: `photo-${sequence}`, file, progress: 0, error: null };
    });
    setPending((current) => [...current, ...added]);
    for (const photo of added) send(photo);
  };

  const remove = useMutation({
    mutationFn: (documentId: string) =>
      unwrap(api.documents.removeDocument({ params: { id: documentId } })),
    onSuccess: refresh,
  });

  return {
    pending,
    uploading: pending.some((photo) => photo.error === null),
    add,
    retry: (photo: PendingPhoto) => send(photo),
    discard: (id: string) => setPending((current) => current.filter((photo) => photo.id !== id)),
    remove,
  };
}
