import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Card, Text, useTheme } from '@oneohm/mobile-ui';
import { Camera, CircleAlert, CircleCheck, Images } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TASK } from '@/copy/tasks';
import { AttachmentTile, PendingTile } from './evidence-tiles';
import { type PhotoSource, pickPhotos } from './pick-photos';
import { useEvidence } from './use-evidence';

/**
 * Site photos for the task: take or choose them, watch them upload, retry a failed one,
 * remove one while the task is open. Other evidence kinds are noted in the note.
 */
export function EvidenceSection({
  task,
  onBusyChange,
}: {
  readonly task: ProjectTask;
  readonly onBusyChange?: (busy: boolean) => void;
}) {
  const theme = useTheme();
  const evidence = useEvidence(task);
  const [denied, setDenied] = useState<string | null>(null);
  useEffect(() => onBusyChange?.(evidence.uploading), [evidence.uploading, onBusyChange]);
  const open = task.status !== 'completed';
  const wantsPhoto = task.evidence.includes('photo');
  const needsPhoto = task.missingEvidence.includes('photo');
  if (!wantsPhoto && task.attachments.length === 0 && evidence.pending.length === 0) return null;

  const choose = async (source: PhotoSource) => {
    setDenied(null);
    const picked = await pickPhotos(source);
    if (picked === 'denied') {
      setDenied(source === 'camera' ? TASK.evidence.cameraDenied : TASK.evidence.libraryDenied);
      return;
    }
    evidence.add(picked);
  };

  const status = needsPhoto ? theme.status.overdue : theme.status.onTrack;
  const StatusIcon = needsPhoto ? CircleAlert : CircleCheck;
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="titleMd">{TASK.evidenceTitle}</Text>
        {task.attachments.length > 0 ? (
          <Text variant="bodySm" tone="secondary">
            {TASK.evidence.attached(task.attachments.length)}
          </Text>
        ) : null}
      </View>
      {wantsPhoto && open ? (
        <View
          style={[styles.status, { backgroundColor: status.tint }]}
          accessibilityRole={needsPhoto ? 'alert' : 'text'}
        >
          <StatusIcon size={16} color={status.fg} />
          <Text variant="bodySm" color={status.fg} style={styles.flex}>
            {needsPhoto ? TASK.evidence.needPhoto : TASK.evidence.photoDone}
          </Text>
        </View>
      ) : null}
      {task.attachments.length + evidence.pending.length > 0 ? (
        <View style={styles.grid}>
          {task.attachments.map((file) => (
            <AttachmentTile
              key={file.id}
              file={file}
              removable={open}
              removing={evidence.remove.isPending && evidence.remove.variables === file.id}
              onRemove={() => evidence.remove.mutate(file.id)}
            />
          ))}
          {evidence.pending.map((photo) => (
            <PendingTile
              key={photo.id}
              photo={photo}
              onRetry={() => evidence.retry(photo)}
              onDiscard={() => evidence.discard(photo.id)}
            />
          ))}
        </View>
      ) : null}
      {open ? (
        <View style={styles.actions}>
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
      ) : null}
      {denied ? (
        <Text variant="bodySm" color={theme.status.overdue.fg}>
          {denied}
        </Text>
      ) : null}
      {task.evidence.some((kind) => kind !== 'photo') ? (
        <Text variant="bodySm" tone="secondary">
          {TASK.evidence.otherKinds}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { gap: 4 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
