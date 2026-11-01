'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { type UploadLinks, uploadDocument } from '@/lib/api/upload';
import type { PendingUpload } from './document-thumb';
import { previewable } from './document-thumb';

let counter = 0;

/**
 * Uploads start as soon as files are picked. Each shows its progress; a failed one keeps
 * its local preview with a retry, so nothing picked is ever silently lost.
 */
export function useUploads(links: UploadLinks, onUploaded: () => Promise<unknown> | undefined) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const linksRef = useRef(links);
  linksRef.current = links;
  const doneRef = useRef(onUploaded);
  doneRef.current = onUploaded;
  const previews = useRef(new Set<string>());

  const update = useCallback((key: string, patch: Partial<PendingUpload>) => {
    setPending((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }, []);

  const drop = useCallback((key: string) => {
    setPending((current) => {
      const item = current.find((entry) => entry.key === key);
      if (item?.preview) {
        URL.revokeObjectURL(item.preview);
        previews.current.delete(item.preview);
      }
      return current.filter((entry) => entry.key !== key);
    });
  }, []);

  const run = useCallback(
    (item: PendingUpload) => {
      update(item.key, { error: null, progress: 0 });
      uploadDocument(item.file, linksRef.current, (progress) => update(item.key, { progress }))
        .then(async () => {
          await doneRef.current();
          drop(item.key);
        })
        .catch((error: unknown) => update(item.key, { error: describeError(error) }));
    },
    [drop, update],
  );

  const add = useCallback(
    (files: FileList | readonly File[] | null) => {
      if (!files) return;
      const items = Array.from(files).map((file) => {
        counter += 1;
        const preview = previewable(file.type) ? URL.createObjectURL(file) : null;
        if (preview) previews.current.add(preview);
        return { key: `upload-${counter}`, file, preview, progress: 0, error: null };
      });
      setPending((current) => [...current, ...items]);
      for (const item of items) run(item);
    },
    [run],
  );

  const retry = useCallback(
    (key: string) => {
      const item = pending.find((entry) => entry.key === key);
      if (item) run(item);
    },
    [pending, run],
  );

  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  return { pending, add, retry, discard: drop, busy: pending.some((item) => !item.error) };
}
