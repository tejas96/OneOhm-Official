import type { ProjectTask } from '@oneohm/api-contracts';
import {
  Button,
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
import { router, useLocalSearchParams } from 'expo-router';
import { Lock, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { ScreenHeader } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { shortDate } from '@/lib/dates';
import { useCan } from '@/session/session-provider';
import { EvidenceNotice, FactsForm } from './facts-form';
import { statusLabel, toneOf } from './task-row';
import { useTaskActions } from './use-task-actions';
import { WaitingSheet } from './waiting-sheet';

/** One task: what it is, what to record, and the next step in one tap. */
export function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: keys.tasks, queryFn: () => unwrap(api.tasks.myTasks()) });
  const task = query.data?.find((item) => item.id === id);
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
  const canApprove = useCan('tasks.approve');
  const actions = useTaskActions(task);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [waiting, setWaiting] = useState(false);
  const blocked = task.blockedBy.length > 0;
  const leaveWhenDone = (updated: ProjectTask) => {
    if (updated.status === 'completed' || updated.status === 'in_review') {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  };
  const failure =
    actions.complete.error ?? actions.start.error ?? actions.approve.error ?? actions.wait.error;
  const errors = fieldErrorsOf(actions.complete.error);
  const meta = [
    { label: TASK.stage, value: COMMON.stages[task.stage] },
    { label: TASK.dueDate, value: shortDate(task.dueDate) },
  ];

  const footer =
    task.status === 'in_review' ? (
      canApprove ? (
        <Button
          label={TASK.approve}
          size="lg"
          fullWidth
          pending={actions.approve.isPending}
          onPress={() => actions.approve.mutate(undefined, { onSuccess: leaveWhenDone })}
        />
      ) : null
    ) : (
      <>
        {task.status === 'in_progress' ? (
          <Button
            label={task.approval && !canApprove ? TASK.sendForApproval : TASK.complete}
            size="lg"
            fullWidth
            disabled={blocked}
            pending={actions.complete.isPending}
            onPress={() => actions.complete.mutate({ facts, note }, { onSuccess: leaveWhenDone })}
          />
        ) : (
          <Button
            label={task.status === 'waiting' ? TASK.resume : TASK.start}
            size="lg"
            fullWidth
            disabled={blocked}
            pending={actions.start.isPending}
            onPress={() => actions.start.mutate()}
          />
        )}
        <Button
          label={TASK.markWaiting}
          variant="secondary"
          fullWidth
          onPress={() => setWaiting(true)}
        />
      </>
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
      <EvidenceNotice task={task} />
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
