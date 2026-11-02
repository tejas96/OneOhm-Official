import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Card, Text, useTheme } from '@oneohm/mobile-ui';
import { PenLine } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TASK } from '@/copy/tasks';
import { isSignatureFile, splitQueued } from './evidence-rules';
import { AttachmentTile, PendingTile } from './evidence-tiles';
import { RequirementRow, type RequirementState } from './requirement-row';
import { SignaturePad } from './signature-pad';
import type { Evidence } from './use-evidence';

/**
 * The customer's sign-off on the phone (PRD 3.17). The drawn signature is saved as an
 * image document on the task (category `customer_signature`) through the upload queue.
 */
export function SignatureCard({
  task,
  evidence,
}: {
  readonly task: ProjectTask;
  readonly evidence: Evidence;
}) {
  const theme = useTheme();
  const [signing, setSigning] = useState(false);
  if (!task.evidence.includes('signature')) return null;
  const open = task.status !== 'completed' && task.status !== 'in_review';
  const signed = task.attachments.filter(isSignatureFile);
  const queued = splitQueued(evidence.pending).signatures;
  const state: RequirementState = !task.missingEvidence.includes('signature')
    ? 'done'
    : queued.length > 0
      ? 'waiting'
      : 'needed';
  const label =
    state === 'done'
      ? TASK.signature.done
      : state === 'waiting'
        ? TASK.evidence.waitingUpload
        : TASK.signature.needed;

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="titleMd">{TASK.signature.title}</Text>
        <Text variant="bodySm" tone="secondary">
          {TASK.signature.body}
        </Text>
      </View>
      {open ? <RequirementRow state={state} label={label} /> : null}
      {signed.length + queued.length > 0 ? (
        <View style={styles.grid}>
          {signed.map((file) => (
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
      {open ? (
        <Button
          label={state === 'needed' ? TASK.signature.ask : TASK.signature.again}
          variant="secondary"
          icon={<PenLine size={16} color={theme.colors.textPrimary} />}
          onPress={() => setSigning(true)}
          fullWidth
        />
      ) : null}
      <SignaturePad
        open={signing}
        onClose={() => setSigning(false)}
        onSave={(png) => {
          setSigning(false);
          void evidence.addSignature(png);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
