import type { WorkOrderSummary } from '@oneohm/api-contracts';
import {
  Card,
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
  Text,
  type Tone,
  useTheme,
} from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight, ClipboardList } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { CREW } from '@/copy/crew';
import { relativeDate } from '@/lib/dates';
import { useCrewOrders } from './use-crew';

export const ORDER_TONE: Readonly<Record<WorkOrderSummary['status'], Tone>> = {
  open: 'neutral',
  in_progress: 'onTrack',
  completed: 'done',
  cancelled: 'neutral',
};

/** The crew's work orders, open ones first, each opening its tasks. */
export function WorkOrdersSection() {
  const theme = useTheme();
  const query = useCrewOrders();
  if (query.isPending) return <LoadingState label={CREW.loading} />;
  if (query.isError)
    return (
      <ErrorState
        title={COMMON.loadError}
        message={describeError(query.error)}
        retryLabel={COMMON.retry}
        onRetry={() => void query.refetch()}
      />
    );
  const orders = [...query.data].sort((a, b) => rank(a) - rank(b));
  if (orders.length === 0)
    return (
      <EmptyState
        icon={<ClipboardList size={22} color={theme.colors.accent} />}
        title={CREW.orders.emptyTitle}
        description={CREW.orders.emptyBody}
      />
    );
  return (
    <View style={styles.list}>
      <SectionTitle title={CREW.orders.title} count={orders.length} />
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </View>
  );
}

const rank = (order: WorkOrderSummary) =>
  order.status === 'in_progress' ? 0 : order.status === 'open' ? 1 : 2;

function OrderCard({ order }: { readonly order: WorkOrderSummary }) {
  const theme = useTheme();
  const open = order.status === 'open' || order.status === 'in_progress';
  const due = order.dueDate ? CREW.orders.due(relativeDate(order.dueDate)) : CREW.orders.noDue;
  return (
    <Card
      onPress={() => router.push(`/work-orders/${order.id}`)}
      accessibilityLabel={`${order.number} ${order.project.code}`}
      style={styles.card}
    >
      <View style={styles.top}>
        <Text variant="mono" tone="tertiary" style={styles.grow} numberOfLines={1}>
          {order.number} · {order.project.code}
        </Text>
        <ChevronRight size={18} color={theme.colors.textTertiary} />
      </View>
      <Text variant="titleMd" numberOfLines={2}>
        {order.project.name}
      </Text>
      <Text variant="bodySm" tone="secondary">
        {CREW.orders.tasks(order.tasksDone, order.taskCount)}
      </Text>
      <View style={styles.bottom}>
        <StatusPill
          size="sm"
          tone={order.overdue ? 'overdue' : ORDER_TONE[order.status]}
          label={order.overdue ? CREW.orders.overdue : CREW.orders.status[order.status]}
        />
        {open ? (
          <Text variant="label" tone="secondary">
            {due}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: { gap: 4, paddingVertical: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  bottom: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
