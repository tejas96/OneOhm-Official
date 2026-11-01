import type { DocumentRecord, ProjectTask } from '@oneohm/api-contracts';
import {
  ApiError,
  describeError,
  NetworkError,
  type UploadableFile,
  unwrap,
  uploadFile,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, api, currentToken, keys } from '@/api/api';

/** A photo picked on this phone: uploading, or failed and waiting for a retry. */
export interface PendingPhoto {
  readonly id: string;
  readonly file: UploadableFile;
  readonly progress: number;
  readonly error: string | null;
  /** Failed for a passing reason (no signal, server busy): it retries by itself. */
  readonly autoRetry: boolean;
  readonly attempts: number;
}

/** Waits between automatic retries; the last one repeats until the upload succeeds. */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** No signal or a server hiccup can pass; a refused file (too big, wrong type) cannot. */
const passing = (error: unknown) =>
  error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);

let sequence = 0;

/**
 * Site photos for one task. Each photo uploads as soon as it is picked (with progress);
 * one that fails for want of signal retries by itself until it goes through (PRD 4.4),
 * and any failure can be retried by hand. Uploaded photos come back as the task's
 * attachments, so the server stays the one record of what is attached.
 */
export function useEvidence(task: ProjectTask) {
  const client = useQueryClient();
  const [pending, setPending] = useState<readonly PendingPhoto[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const scheduled = timers.current;
    return () => {
      for (const timer of scheduled.values()) clearTimeout(timer);
    };
  }, []);
  const cancelRetry = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  };
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: keys.task(task.id) });
    await client.invalidateQueries({ queryKey: keys.tasks });
  }, [client, task.id]);

  const patch = (id: string, change: Partial<PendingPhoto>) =>
    setPending((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...change } : photo)),
    );

  const send = (photo: PendingPhoto) => {
    cancelRetry(photo.id);
    patch(photo.id, { progress: 0, error: null, autoRetry: false });
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
      .catch((error: unknown) => {
        const autoRetry = passing(error);
        const attempts = photo.attempts + 1;
        patch(photo.id, { error: describeError(error), autoRetry, attempts });
        if (!autoRetry) return;
        const wait = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1] ?? 60_000;
        timers.current.set(
          photo.id,
          setTimeout(() => send({ ...photo, attempts }), wait),
        );
      });
  };

  const add = (files: readonly UploadableFile[]) => {
    const added = files.map((file) => {
      sequence += 1;
      return {
        id: `photo-${sequence}`,
        file,
        progress: 0,
        error: null,
        autoRetry: false,
        attempts: 0,
      };
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
    discard: (id: string) => {
      cancelRetry(id);
      setPending((current) => current.filter((photo) => photo.id !== id));
    },
    remove,
  };
}
