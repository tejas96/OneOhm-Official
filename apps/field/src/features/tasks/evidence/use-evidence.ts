import type { ProjectTask } from '@oneohm/api-contracts';
import { SIGNATURE_CATEGORY, VOICE_NOTE_CATEGORY } from '@oneohm/domain';
import { type UploadableFile, unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { TASK } from '@/copy/tasks';
import type { PickedVideo } from '@/features/media/pick-video';
import { onItsWay } from '@/features/uploads/queue-logic';
import { useUploadQueue } from '@/features/uploads/upload-queue';
import { documentCategoryFor } from './evidence-rules';
import type { PickedPhoto } from './pick-photos';

/**
 * Evidence files for one task. Each one is kept on the phone and goes through the
 * upload queue, so it survives no signal or the app being closed (PRD 4.4). Uploaded
 * files come back as the task's attachments: the server stays the one record.
 */
export function useEvidence(task: ProjectTask) {
  const client = useQueryClient();
  const queue = useUploadQueue();
  const pending = queue.items.filter((item) => item.taskId === task.id);

  const remove = useMutation({
    mutationFn: (documentId: string) =>
      unwrap(api.documents.removeDocument({ params: { id: documentId } })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.task(task.id) });
      await client.invalidateQueries({ queryKey: keys.tasks });
    },
  });

  const addPhotos = (photos: readonly PickedPhoto[]) =>
    queue.add(
      photos.map((photo) => ({
        taskId: task.id,
        kind: 'photo' as const,
        category: 'site_photo',
        name: photo.file.name,
        type: photo.file.type,
        file: photo.file,
        geotag: photo.geotag,
      })),
    );

  const addDocuments = (files: readonly UploadableFile[]) =>
    queue.add(
      files.map((file) => ({
        taskId: task.id,
        kind: 'document' as const,
        category: documentCategoryFor(task),
        name: file.name,
        type: file.type,
        file,
      })),
    );

  /** A short site video: a site photo in motion, geotagged the same way (PRD 4.2). */
  const addVideo = (video: PickedVideo) =>
    queue.add([
      {
        taskId: task.id,
        kind: 'video',
        category: 'site_photo',
        name: video.file.name,
        type: video.file.type,
        file: video.file,
        geotag: video.geotag,
      },
    ]);

  const addVoice = (file: UploadableFile) =>
    queue.add([
      {
        taskId: task.id,
        kind: 'voice',
        category: VOICE_NOTE_CATEGORY,
        name: file.name,
        type: file.type,
        file,
      },
    ]);

  const addSignature = (bytes: Uint8Array) =>
    queue.add([
      {
        taskId: task.id,
        kind: 'signature',
        category: SIGNATURE_CATEGORY,
        name: TASK.signature.fileName,
        type: 'image/png',
        bytes,
      },
    ]);

  return {
    pending,
    progress: queue.progress,
    /** Something is still on its way: completing waits for it. */
    uploading: pending.some(onItsWay),
    addPhotos,
    addDocuments,
    addVideo,
    addVoice,
    addSignature,
    retry: queue.retry,
    discard: queue.discard,
    remove,
  };
}

export type Evidence = ReturnType<typeof useEvidence>;
