import type { ProjectTask } from '@oneohm/api-contracts';
import { CHECKLIST_TICKED } from '@oneohm/domain';
import {
  Button,
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
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { ScreenHeader } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { CrewMaterialPrompt } from '@/features/crew/crew-material-prompt';
import { SiteVisitCard } from '@/features/site/site-visit-card';
import { businessToday, shortDate } from '@/lib/dates';
import { useCan, useCurrentUser } from '@/session/session-provider';
import { ChecklistCard } from './evidence/checklist-card';
import { completionFacts } from './evidence/evidence-rules';
import { EvidenceSection } from './evidence/evidence-section';
import { SignatureCard } from './evidence/signature-card';
import { useEvidence } from './evidence/use-evidence';
import { FactsForm } from './facts-form';
import { NoteSheet } from './note-sheet';
import { RescheduleSheet } from './reschedule-sheet';
import { staleLabelDays } from './stale-days';
import { TaskBlockersCard } from './task-blockers-card';
import { TaskFooter } from './task-footer';
import { TaskNotes } from './task-notes';
import { statusLabel, toneOf } from './task-row';
import { TaskTimeline } from './task-timeline';
import { useChecklistTicks } from './use-checklist-ticks';
import { useTaskActions } from './use-task-actions';
import { WaitingSheet } from './waiting-sheet';

type SheetName = 'waiting' | 'reschedule' | 'update' | 'sendBack';

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
  const user = useCurrentUser();
  const manager = useCan('tasks.assign', 'projects.manage');
  const canWork = task.assignee?.id === user.id || manager;
  const actions = useTaskActions(task);
  const evidence = useEvidence(task);
  const [facts, setFacts] = useState<Record<string, string>>(() => ({ ...task.knownFacts }));
  const { ticked, toggle } = useChecklistTicks(task, canWork);
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const close = () => setSheet(null);
  const closeOnSuccess = { onSuccess: close };
  const open = (name: SheetName) => {
    // A new sheet starts without the last attempt's error.
    for (const mutation of [actions.reschedule, actions.postUpdate, actions.sendBack, actions.wait])
      mutation.reset();
    setSheet(name);
  };
  // Sent back: the work is the assignee's again, so the reviewer goes back to the list.
  const leave = () => {
    close();
    if (router.canGoBack()) router.back();
  };
  // The waiting sheet shows its own error, in front of the screen.
  const failure = actions.complete.error ?? actions.start.error ?? actions.approve.error;
  const errors = fieldErrorsOf(actions.complete.error);
  const meta = [
    { label: TASK.stage, value: COMMON.stages[task.stage] },
    { label: TASK.dueDate, value: shortDate(task.dueDate) },
    ...(task.stale === true
      ? [
          {
            label: TASK.updatedLabel,
            value: TASK.stale(staleLabelDays(task.lastUpdateAt, businessToday())),
          },
        ]
      : []),
    ...(task.priority && task.priority !== 'none'
      ? [{ label: TASK.priority.label, value: TASK.priority[task.priority] }]
      : []),
  ];

  const footer = (
    <TaskFooter
      task={task}
      actions={actions}
      facts={completionFacts(facts, ticked, CHECKLIST_TICKED)}
      note={note}
      uploading={evidence.uploading}
      onWaiting={() => open('waiting')}
      onSendBack={() => open('sendBack')}
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
        {manager && task.status !== 'completed' ? (
          <Button
            label={TASK.changeDue}
            size="sm"
            variant="quiet"
            onPress={() => open('reschedule')}
          />
        ) : null}
      </View>
      <TaskNotes task={task} />
      <TaskBlockersCard task={task} />
      <SiteVisitCard task={task} />
      {task.approval && task.status !== 'in_review' ? (
        <View style={styles.row}>
          <ShieldCheck size={16} color={theme.status.review.fg} />
          <Text variant="bodySm" color={theme.status.review.fg}>
            {TASK.approvalNote}
          </Text>
        </View>
      ) : null}
      {failure ? (
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
      <CrewMaterialPrompt projectId={task.projectId} taskId={task.id} />
      <SignatureCard task={task} evidence={evidence} />
      <TaskTimeline task={task} canPost={canWork} onPost={() => open('update')} />
      <WaitingSheet
        open={sheet === 'waiting'}
        pending={actions.wait.isPending}
        error={actions.wait.error}
        initialParty={task.waitingParty}
        onClose={close}
        onSave={(party, waitingNote) =>
          actions.wait.mutate({ party, note: waitingNote }, closeOnSuccess)
        }
      />
      <RescheduleSheet
        key={`reschedule-${sheet === 'reschedule'}`}
        task={task}
        open={sheet === 'reschedule'}
        pending={actions.reschedule.isPending}
        error={actions.reschedule.error}
        onClose={close}
        onSave={(input) => actions.reschedule.mutate(input, closeOnSuccess)}
      />
      {(['update', 'sendBack'] as const).map((kind) => {
        const mutation = kind === 'update' ? actions.postUpdate : actions.sendBack;
        return (
          <NoteSheet
            key={`${kind}-${sheet === kind}`}
            kind={kind}
            open={sheet === kind}
            pending={mutation.isPending}
            error={mutation.error}
            onClose={close}
            onSave={(text) =>
              mutation.mutate(text, { onSuccess: kind === 'sendBack' ? leave : close })
            }
          />
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  metaItem: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alert: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
