import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Card, Text, useTheme } from '@oneohm/mobile-ui';
import { Camera, FilePlus, Images } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TASK } from '@/copy/tasks';
import { UPLOADS } from '@/copy/uploads';
import { useTaskSite } from '@/features/site/use-task-site';
import { isSignatureFile, splitQueued } from './evidence-rules';
import { AttachmentTile, PendingTile } from './evidence-tiles';
import { pickDocuments } from './pick-documents';
import { type PhotoSource, pickPhotos } from './pick-photos';
import { RequirementRow, type RequirementState } from './requirement-row';
import type { Evidence } from './use-evidence';

function stateOf(missing: boolean, waiting: boolean): RequirementState {
  if (!missing) return 'done';
  return waiting ? 'waiting' : 'needed';
}

/**
 * Site photos and documents for the task: take, choose or attach them, watch them
 * upload (or wait for signal), retry a refused one, remove one while the task is open.
 */
export function EvidenceSection({
  task,
  evidence,
}: {
  readonly task: ProjectTask;
  readonly evidence: Evidence;
}) {
  const theme = useTheme();
  const [notice, setNotice] = useState<string | null>(null);
  // Photos carry their location only with consent, in working hours (PRD 4.2, 4.3).
  const locate = useTaskSite(task.id).data?.tracking.state === 'on';
  const open = task.status !== 'completed';
  const wantsPhoto = task.evidence.includes('photo');
  const wantsDocument = task.evidence.includes('document');
  const files = task.attachments.filter((file) => !isSignatureFile(file));
  const queued = splitQueued(evidence.pending).files;
  if (!wantsPhoto && !wantsDocument && files.length === 0 && queued.length === 0) return null;

  const choose = async (source: PhotoSource) => {
    setNotice(null);
    const picked = await pickPhotos(source, locate);
    if (picked === 'denied') {
      setNotice(source === 'camera' ? TASK.evidence.cameraDenied : TASK.evidence.libraryDenied);
      return;
    }
    await evidence.addPhotos(picked);
  };
  const attach = async () => {
    setNotice(null);
    const picked = await pickDocuments();
    if (picked.tooLarge.length > 0) setNotice(TASK.evidence.tooLarge(picked.tooLarge.join(', ')));
    await evidence.addDocuments(picked.files);
  };

  const waitingPhoto = queued.some((item) => item.kind === 'photo');
  const waitingDocument = queued.some((item) => item.kind === 'document');
  const photoState = stateOf(task.missingEvidence.includes('photo'), waitingPhoto);
  const documentState = stateOf(task.missingEvidence.includes('document'), waitingDocument);
  const label = (state: RequirementState, needed: string, done: string) =>
    state === 'done' ? done : state === 'waiting' ? TASK.evidence.waitingUpload : needed;

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="titleMd">{TASK.evidenceTitle}</Text>
        {files.length > 0 ? (
          <Text variant="bodySm" tone="secondary">
            {TASK.evidence.attached(files.length)}
          </Text>
        ) : null}
        {queued.length > 0 ? (
          <Text variant="bodySm" color={theme.status.waiting.fg}>
            {UPLOADS.waiting(queued.length)}
          </Text>
        ) : null}
      </View>
      {wantsPhoto && open ? (
        <RequirementRow
          state={photoState}
          label={label(photoState, TASK.evidence.needPhoto, TASK.evidence.photoDone)}
        />
      ) : null}
      {wantsDocument && open ? (
        <RequirementRow
          state={documentState}
          label={label(documentState, TASK.evidence.needDocument, TASK.evidence.documentDone)}
        />
      ) : null}
      {files.length + queued.length > 0 ? (
        <View style={styles.grid}>
          {files.map((file) => (
            <AttachmentTile
              key={file.id}
              file={file}
              removable={open}
              removing={evidence.remove.isPending && evidence.remove.variables === file.id}
              onRemove={() => evidence.remove.mutate(file.id)}
            />
          ))}
          {queued.map((item) => (
            <PendingTile
              key={item.id}
              item={item}
              progress={evidence.progress[item.id]}
              onRetry={() => evidence.retry(item.id)}
              onDiscard={() => evidence.discard(item.id)}
            />
          ))}
        </View>
      ) : null}
      {queued.length > 0 && open ? (
        <Text variant="bodySm" tone="secondary">
          {`${UPLOADS.body} ${UPLOADS.holdComplete}`}
        </Text>
      ) : null}
      {open ? (
        <View style={styles.actions}>
          {wantsPhoto || !wantsDocument ? (
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
          ) : null}
          {wantsDocument ? (
            <Button
              label={TASK.evidence.addDocument}
              variant="secondary"
              icon={<FilePlus size={16} color={theme.colors.textPrimary} />}
              onPress={() => void attach()}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}
      {notice ? (
        <Text variant="bodySm" color={theme.status.overdue.fg}>
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
