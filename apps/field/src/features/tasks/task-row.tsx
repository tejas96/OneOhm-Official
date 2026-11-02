import type { ProjectTask } from '@oneohm/api-contracts';
import { doNextReason } from '@oneohm/domain';
import { Card, StatusPill, Text, type Tone, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight, CloudUpload, Lock } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { UPLOADS } from '@/copy/uploads';
import { useUploadQueue } from '@/features/uploads/upload-queue';
import { businessToday, daysBetween, relativeDate } from '@/lib/dates';

export function toneOf(task: ProjectTask): Tone {
  if (task.status === 'in_review') return 'review';
  if (task.status === 'waiting') return 'waiting';
  if (task.returned) return 'atRisk';
  if (task.overdue) return 'overdue';
  if (task.status === 'in_progress') return 'onTrack';
  return 'neutral';
}

export function statusLabel(task: ProjectTask): string {
  if (task.status === 'waiting' && task.waitingParty === 'internal') return TASK.helpPill;
  if (task.status === 'waiting') return TASK.waitingOn(COMMON.parties[task.waitingParty]);
  if (task.returned) return TASK.returnedPill;
  if (task.overdue && task.status !== 'in_review') {
    return TASK.overdueBy(Math.max(1, daysBetween(task.dueDate, businessToday())));
  }
  return TASK.status[task.status];
}

/** One task on a list: what, where, and when it is due. */
export function TaskRow({ task }: { readonly task: ProjectTask }) {
  const theme = useTheme();
  const blocked = task.blockedBy.length > 0;
  const waiting = useUploadQueue().items.filter((item) => item.taskId === task.id).length;
  return (
    <Card
      onPress={() => router.push(`/tasks/${task.id}`)}
      accessibilityLabel={task.title}
      style={styles.card}
    >
      <View style={styles.top}>
        <Text variant="mono" tone="tertiary" numberOfLines={1} style={styles.flex}>
          {task.projectCode} · {COMMON.stages[task.stage]}
        </Text>
        <ChevronRight size={18} color={theme.colors.textTertiary} />
      </View>
      <Text variant="titleMd" numberOfLines={2}>
        {task.title}
      </Text>
      <Text variant="bodySm" tone="secondary" numberOfLines={1}>
        {task.projectName}
      </Text>
      <DoNextLine task={task} />
      {waiting > 0 ? (
        <View style={styles.due}>
          <CloudUpload size={14} color={theme.status.waiting.fg} />
          <Text variant="label" color={theme.status.waiting.fg}>
            {UPLOADS.waitingShort(waiting)}
          </Text>
        </View>
      ) : null}
      <View style={styles.bottom}>
        <StatusPill tone={toneOf(task)} label={statusLabel(task)} size="sm" />
        <View style={styles.due}>
          {blocked ? <Lock size={14} color={theme.colors.textTertiary} /> : null}
          <Text variant="label" tone="secondary">
            {task.dueDate === businessToday()
              ? TASK.dueToday
              : TASK.due(relativeDate(task.dueDate))}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** Why the task sits where it does, when there is a reason stronger than its due date. */
function DoNextLine({ task }: { readonly task: ProjectTask }) {
  const theme = useTheme();
  if (task.status !== 'ready' && task.status !== 'pending' && task.status !== 'in_progress')
    return null;
  if (task.blockedBy.length > 0 || task.priority === undefined) return null;
  const reason = doNextReason(task, businessToday());
  let text: string | null = null;
  if (reason.kind === 'priority')
    text = TASK.reason.priority(TASK.priority[reason.priority], reason.by);
  else if (reason.kind === 'blocksUrgent') text = TASK.reason.blocksUrgent;
  else if (reason.kind === 'blocks')
    text =
      reason.count > 0 ? TASK.reason.blocks(reason.count, reason.payment) : TASK.reason.payment;
  if (!text) return null;
  const urgent = task.priority === 'urgent' || task.blocksUrgent;
  return (
    <Text variant="label" color={urgent ? theme.status.overdue.fg : theme.colors.accent}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, paddingVertical: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  bottom: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  due: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
