import type { WorkOrderDetail } from '@oneohm/api-contracts';
import {
  Card,
  EmptyState,
  LoadingState,
  PressableScale,
  Screen,
  StatusPill,
  Text,
  type Tone,
  useTheme,
} from '@oneohm/mobile-ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader, SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { CREW } from '@/copy/crew';
import { TASK } from '@/copy/tasks';
import { shortDate } from '@/lib/dates';
import { useCrewOrder } from './use-crew';
import { ORDER_TONE } from './work-orders-section';

type OrderTask = WorkOrderDetail['tasks'][number];

const taskTone = (task: OrderTask): Tone =>
  task.status === 'completed'
    ? 'done'
    : task.overdue
      ? 'overdue'
      : task.status === 'in_review'
        ? 'review'
        : task.status === 'waiting'
          ? 'waiting'
          : task.status === 'in_progress'
            ? 'onTrack'
            : 'neutral';

/** One work order for the crew: status, due date, scope and its tasks. No money here. */
export function WorkOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useCrewOrder(id);
  if (query.isPending)
    return (
      <Screen>
        <LoadingState label={COMMON.loading} />
      </Screen>
    );
  const order = query.data;
  if (!order)
    return (
      <Screen>
        <ScreenHeader title={CREW.orders.title} />
        <EmptyState title={CREW.order.notFound} />
      </Screen>
    );
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <ScreenHeader
        overline={`${order.number} · ${order.project.code}`}
        title={order.project.name}
      />
      <View style={styles.meta}>
        <StatusPill
          tone={order.overdue ? 'overdue' : ORDER_TONE[order.status]}
          label={order.overdue ? CREW.orders.overdue : CREW.orders.status[order.status]}
        />
        <View style={styles.metaItem}>
          <Text variant="label" tone="tertiary">
            {CREW.order.due}
          </Text>
          <Text variant="bodySm">
            {order.dueDate ? shortDate(order.dueDate) : CREW.orders.noDue}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Text variant="label" tone="tertiary">
            {CREW.order.tasksTitle}
          </Text>
          <Text variant="bodySm">{CREW.orders.tasks(order.tasksDone, order.taskCount)}</Text>
        </View>
      </View>
      {order.cancelledReason ? (
        <Text variant="bodySm" tone="secondary">
          {CREW.order.cancelled(order.cancelledReason)}
        </Text>
      ) : null}
      {order.scope ? (
        <Card tone="sunken" style={styles.scope}>
          <Text variant="label" tone="tertiary">
            {CREW.order.scope}
          </Text>
          <Text variant="body">{order.scope}</Text>
        </Card>
      ) : null}
      <View style={styles.list}>
        <SectionTitle title={CREW.order.tasksTitle} count={order.tasks.length} />
        {order.tasks.length === 0 ? (
          <Text variant="bodySm" tone="secondary">
            {CREW.order.noTasks}
          </Text>
        ) : (
          order.tasks.map((task) => <TaskLine key={task.id} task={task} />)
        )}
      </View>
    </Screen>
  );
}

function TaskLine({ task }: { readonly task: OrderTask }) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={task.title}
      onPress={() => router.push(`/tasks/${task.id}`)}
      style={[
        styles.task,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle },
      ]}
    >
      <View style={styles.grow}>
        <Text variant="titleMd" numberOfLines={2}>
          {task.title}
        </Text>
        <View style={styles.taskMeta}>
          <StatusPill size="sm" tone={taskTone(task)} label={TASK.status[task.status]} />
          <Text variant="label" tone="secondary">
            {TASK.due(shortDate(task.dueDate))}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color={theme.colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  metaItem: { gap: 2 },
  scope: { gap: 4 },
  list: { gap: 10 },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  grow: { flex: 1, gap: 6 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});
