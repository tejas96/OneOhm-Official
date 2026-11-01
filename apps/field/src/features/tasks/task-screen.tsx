import type { ProjectTask } from '@oneohm/api-contracts';
import { CHECKLIST_TICKED } from '@oneohm/domain';
import {
  Card,
  describeError,
  EmptyState,
  fieldErrorsOf,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Lock, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { ScreenHeader } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { shortDate } from '@/lib/dates';
import { ChecklistCard } from './evidence/checklist-card';
import { completionFacts } from './evidence/evidence-rules';
import { EvidenceSection } from './evidence/evidence-section';
import { SignatureCard } from './evidence/signature-card';
import { useEvidence } from './evidence/use-evidence';
import { FactsForm } from './facts-form';
import { TaskFooter } from './task-footer';
import { statusLabel, toneOf } from './task-row';
import { useTaskActions } from './use-task-actions';
import { WaitingSheet } from './waiting-sheet';

/** One task: what it is, what to record, and the next step in one tap. */
export function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: keys.task(id),
    queryFn: () => unwrap(api.tasks.getTask({ params: { id } })),
    retry: false,
  });
  const task = query.data;
  if (query.isPending)
    return (
      <Screen>
        <LoadingState label={COMMON.loading} />
      </Screen>
    );
  if (!task) {
    return (
      <Screen>
        <ScreenHeader title={TASK.status.completed} />
        <EmptyState title={TASK.notFound} />
      </Screen>
    );
  }
  return <TaskDetail key={task.id} task={task} />;
}

function TaskDetail({ task }: { readonly task: ProjectTask }) {
  const theme = useTheme();
  const actions = useTaskActions(task);
  const evidence = useEvidence(task);
  const [facts, setFacts] = useState<Record<string, string>>(() => ({ ...task.knownFacts }));
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(task.checklist.filter((item) => item.done).map((item) => item.key)),
  );
  const toggle = (key: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [note, setNote] = useState('');
  const [waiting, setWaiting] = useState(false);
  const blocked = task.blockedBy.length > 0;
  const failure =
    actions.complete.error ?? actions.start.error ?? actions.approve.error ?? actions.wait.error;
  const errors = fieldErrorsOf(actions.complete.error);
  const meta = [
    { label: TASK.stage, value: COMMON.stages[task.stage] },
    { label: TASK.dueDate, value: shortDate(task.dueDate) },
  ];

  const footer = (
    <TaskFooter
      task={task}
      actions={actions}
      facts={completionFacts(facts, ticked, CHECKLIST_TICKED)}
      note={note}
      uploading={evidence.uploading}
      onWaiting={() => setWaiting(true)}
    />
  );

  return (
    <Screen footer={footer}>
      <ScreenHeader overline={`${task.projectCode} · ${task.projectName}`} title={task.title} />
      <View style={styles.meta}>
        <StatusPill tone={toneOf(task)} label={statusLabel(task)} />
        {meta.map((item) => (
          <View key={item.label} style={styles.metaItem}>
            <Text variant="label" tone="tertiary">
              {item.label}
            </Text>
            <Text variant="bodySm">{item.value}</Text>
          </View>
        ))}
      </View>
      {blocked ? (
        <Card tone="sunken" style={styles.card}>
          <View style={styles.row}>
            <Lock size={16} color={theme.colors.textSecondary} />
            <Text variant="titleMd">{TASK.blockedTitle}</Text>
          </View>
          <Text variant="bodySm" tone="secondary">
            {TASK.blockedBody}
          </Text>
          {task.blockedBy.map((title) => (
            <Text key={title} variant="body">
              · {title}
            </Text>
          ))}
        </Card>
      ) : null}
      {task.approval ? (
        <View style={styles.row}>
          <ShieldCheck size={16} color={theme.status.review.fg} />
          <Text variant="bodySm" color={theme.status.review.fg}>
            {TASK.approvalNote}
          </Text>
        </View>
      ) : null}
      {failure && Object.keys(errors).length === 0 ? (
        <View
          style={[styles.alert, { backgroundColor: theme.status.overdue.tint }]}
          accessibilityRole="alert"
        >
          <Text variant="bodySm" color={theme.status.overdue.fg}>
            {describeError(failure)}
          </Text>
        </View>
      ) : null}
      {task.status !== 'in_review' ? (
        <FactsForm
          task={task}
          facts={facts}
          note={note}
          errors={errors}
          onFact={(key, value) => setFacts((current) => ({ ...current, [key]: value }))}
          onNote={setNote}
        />
      ) : null}
      <ChecklistCard task={task} ticked={ticked} onToggle={toggle} />
      <EvidenceSection task={task} evidence={evidence} />
      <SignatureCard task={task} evidence={evidence} />
      <WaitingSheet
        open={waiting}
        pending={actions.wait.isPending}
        initialParty={task.waitingParty}
        onClose={() => setWaiting(false)}
        onSave={(party, waitingNote) =>
          actions.wait.mutate({ party, note: waitingNote }, { onSuccess: () => setWaiting(false) })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  metaItem: { gap: 2 },
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alert: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
