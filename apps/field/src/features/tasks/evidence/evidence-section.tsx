import type { ProjectTask } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TASK } from '@/copy/tasks';
import { UPLOADS } from '@/copy/uploads';
import { useTaskSite } from '@/features/site/use-task-site';
import { EvidenceActions } from './evidence-actions';
import { isSignatureFile, splitQueued } from './evidence-rules';
import { AttachmentTile, PendingTile } from './evidence-tiles';
import { RequirementRow, type RequirementState } from './requirement-row';
import type { Evidence } from './use-evidence';

function stateOf(missing: boolean, waiting: boolean): RequirementState {
  if (!missing) return 'done';
  return waiting ? 'waiting' : 'needed';
}

/**
 * Site photos, videos, voice notes and documents for the task: add them, watch them
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
  const site = useTaskSite(task.id).data;
  const locate = site?.tracking.state === 'on';
  // Site work can always add voice notes and videos, required or not.
  const onSite = Boolean(site?.kind);
  const open = task.status !== 'completed';
  const wantsPhoto = task.evidence.includes('photo');
  const wantsDocument = task.evidence.includes('document');
  const files = task.attachments.filter((file) => !isSignatureFile(file));
  const queued = splitQueued(evidence.pending).files;
  const empty = files.length === 0 && queued.length === 0;
  if (!wantsPhoto && !wantsDocument && !onSite && empty) return null;

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
              onRemove={() => {
                // One removal at a time: repeat taps while it runs do nothing.
                if (!evidence.remove.isPending) evidence.remove.mutate(file.id);
              }}
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
        <EvidenceActions
          evidence={evidence}
          wantsPhoto={wantsPhoto}
          wantsDocument={wantsDocument}
          onSite={onSite}
          locate={locate}
          onNotice={setNotice}
        />
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
});
