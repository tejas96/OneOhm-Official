import type { ServiceVisit } from '@oneohm/api-contracts';
import { Button, Card, Text, useTheme } from '@oneohm/mobile-ui';
import { Camera, Images } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SERVICE } from '@/copy/service';
import { TASK } from '@/copy/tasks';
import { UPLOADS } from '@/copy/uploads';
import { MediaActions } from '@/features/media/media-actions';
import { AttachmentTile, PendingTile } from '@/features/tasks/evidence/evidence-tiles';
import { type PhotoSource, pickPhotos } from '@/features/tasks/evidence/pick-photos';
import { onItsWay } from '@/features/uploads/queue-logic';
import { useUploadQueue } from '@/features/uploads/upload-queue';

/** The visit's files waiting on this phone, and whether any is still on its way. */
export function useServiceUploads(id: string) {
  const queue = useUploadQueue();
  const pending = queue.items.filter((item) => item.serviceRequestId === id);
  return { queue, pending, uploading: pending.some(onItsWay) };
}

/**
 * Photos, short videos and voice notes from the visit (PRD 5.5, 4.2). Each is kept on
 * the phone and sent by the upload queue, which retries until there is signal; photos
 * and videos keep where they were taken, with consent only.
 */
export function ServiceEvidence({ visit }: { readonly visit: ServiceVisit }) {
  const theme = useTheme();
  const { queue, pending } = useServiceUploads(visit.id);
  const [notice, setNotice] = useState<string | null>(null);
  const locate = visit.tracking.state === 'on';
  const target = { serviceRequestId: visit.id };
  const choose = async (source: PhotoSource) => {
    setNotice(null);
    const picked = await pickPhotos(source, locate);
    if (picked === 'denied') {
      setNotice(source === 'camera' ? TASK.evidence.cameraDenied : TASK.evidence.libraryDenied);
      return;
    }
    await queue.add(
      picked.map((photo) => ({
        ...target,
        kind: 'photo' as const,
        category: 'site_photo',
        name: photo.file.name,
        type: photo.file.type,
        file: photo.file,
        geotag: photo.geotag,
      })),
    );
  };
  if (!visit.canWork && visit.files.length === 0) return null;
  const count = visit.files.length + pending.length;

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="titleMd">{SERVICE.evidence}</Text>
        <Text variant="bodySm" tone="secondary">
          {SERVICE.evidenceHint}
        </Text>
        {pending.length > 0 ? (
          <Text variant="bodySm" color={theme.status.waiting.fg}>
            {UPLOADS.waiting(pending.length)}
          </Text>
        ) : null}
      </View>
      {count > 0 ? (
        <View style={styles.grid}>
          {visit.files.map((file) => (
            <AttachmentTile
              key={file.id}
              file={file}
              removable={false}
              removing={false}
              onRemove={() => undefined}
            />
          ))}
          {pending.map((item) => (
            <PendingTile
              key={item.id}
              item={item}
              progress={queue.progress[item.id]}
              onRetry={() => queue.retry(item.id)}
              onDiscard={() => queue.discard(item.id)}
            />
          ))}
        </View>
      ) : (
        <Text variant="bodySm" tone="tertiary">
          {SERVICE.noEvidence}
        </Text>
      )}
      {visit.canWork ? (
        <View style={styles.actions}>
          <View style={styles.row}>
            <Button
              label={TASK.evidence.takePhoto}
              variant="secondary"
              icon={<Camera size={16} color={theme.colors.textPrimary} />}
              onPress={() => void choose('camera')}
              style={styles.flex}
            />
            <Button
              label={TASK.evidence.choose}
              variant="secondary"
              icon={<Images size={16} color={theme.colors.textPrimary} />}
              onPress={() => void choose('library')}
              style={styles.flex}
            />
          </View>
          <MediaActions
            locate={locate}
            onNotice={setNotice}
            onVideo={(video) =>
              queue.add([
                {
                  ...target,
                  kind: 'video',
                  category: 'site_photo',
                  name: video.file.name,
                  type: video.file.type,
                  file: video.file,
                  geotag: video.geotag,
                },
              ])
            }
            onVoice={(file) =>
              queue.add([
                {
                  ...target,
                  kind: 'voice',
                  category: 'voice_note',
                  name: file.name,
                  type: file.type,
                  file,
                },
              ])
            }
          />
        </View>
      ) : null}
      {notice ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
