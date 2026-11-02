import type { LeaveRequestRecord, MyWorkday } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  type Tone,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarDays, Plus } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { LEAVE } from '@/copy/workforce';
import { useWorkday } from '@/features/attendance/use-workday';
import { confirmAction } from '@/lib/confirm';
import { shortDate } from '@/lib/dates';

const TONE: Readonly<Record<LeaveRequestRecord['status'], Tone>> = {
  pending: 'review',
  approved: 'done',
  rejected: 'overdue',
  cancelled: 'neutral',
};

/** Balances, the way to ask for leave, and what is planned (PRD 4.6). */
export function LeaveScreen() {
  const theme = useTheme();
  const query = useWorkday();
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.head}>
        <Text variant="overline" tone="tertiary">
          {LEAVE.overline}
        </Text>
        <Text variant="displayLg">{LEAVE.title}</Text>
      </View>
      {query.isPending ? <LoadingState label={LEAVE.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? (
        <>
          <Balances workday={query.data} />
          <Button
            label={LEAVE.request}
            icon={<Plus size={18} color={theme.colors.onAccent} />}
            onPress={() => router.push('/leave/new')}
            fullWidth
            size="lg"
          />
          {query.data.leave.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={22} color={theme.colors.accent} />}
              title={LEAVE.emptyTitle}
              description={LEAVE.emptyBody}
            />
          ) : (
            query.data.leave.map((request) => <RequestCard key={request.id} request={request} />)
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Balances({ workday }: { readonly workday: MyWorkday }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.balances}
    >
      {workday.balances.map((balance) => {
        const left = balance.allowedHalfDays - balance.usedHalfDays - balance.pendingHalfDays;
        const used = balance.allowedHalfDays
          ? (balance.usedHalfDays + balance.pendingHalfDays) / balance.allowedHalfDays
          : 0;
        return (
          <Card key={balance.leaveType} style={styles.balance}>
            <Text variant="label" tone="secondary">
              {balance.label}
            </Text>
            <Text variant="displayMd">{LEAVE.left(Math.max(0, left))}</Text>
            <Text variant="label" tone="tertiary">
              {LEAVE.daysLeft}
            </Text>
            <View style={[styles.track, { backgroundColor: theme.colors.surfaceSunken }]}>
              <View
                style={[
                  styles.bar,
                  { width: `${Math.min(100, used * 100)}%`, backgroundColor: theme.colors.accent },
                ]}
              />
            </View>
            <Text variant="mono" tone="tertiary">
              {LEAVE.usedPending(balance.usedHalfDays, balance.pendingHalfDays)}
            </Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}

function RequestCard({ request }: { readonly request: LeaveRequestRecord }) {
  const toast = useToast();
  const client = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => unwrap(api.workforce.cancelLeave({ params: { id: request.id } })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.workday });
      toast(LEAVE.cancelled);
    },
    onError: (error) => toast(describeError(error)),
  });
  const askToCancel = () => {
    if (cancel.isPending) return;
    confirmAction({
      title: LEAVE.cancelConfirm.title,
      message: LEAVE.cancelConfirm.body,
      confirm: LEAVE.cancelConfirm.yes,
      cancel: LEAVE.cancelConfirm.no,
      onConfirm: () => cancel.mutate(),
    });
  };
  const range =
    request.fromDate === request.toDate
      ? shortDate(request.fromDate)
      : `${shortDate(request.fromDate)} – ${shortDate(request.toDate)}`;
  return (
    <Card style={styles.request}>
      <View style={styles.row}>
        <Text variant="titleMd" style={styles.grow}>
          {request.leaveLabel}
        </Text>
        <Text variant="mono" tone="secondary">
          {LEAVE.days(request.halfDays)}
        </Text>
      </View>
      <Text variant="body" tone="secondary">
        {range}
      </Text>
      <View style={styles.pills}>
        <StatusPill size="sm" tone={TONE[request.status]} label={LEAVE.status[request.status]} />
        {request.emergency ? (
          <StatusPill size="sm" tone="atRisk" label={LEAVE.emergencyBadge} />
        ) : null}
      </View>
      {request.tasksHandedOver > 0 ? (
        <Text variant="label" tone="tertiary">
          {LEAVE.handedOver(request.tasksHandedOver)}
        </Text>
      ) : null}
      {request.status === 'pending' || request.status === 'approved' ? (
        <Button
          label={LEAVE.cancel}
          size="sm"
          variant="quiet"
          pending={cancel.isPending}
          onPress={askToCancel}
          style={styles.cancel}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2, paddingTop: 8 },
  balances: { gap: 12, paddingRight: 4 },
  balance: { width: 168, gap: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  bar: { height: 6, borderRadius: 3 },
  request: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  grow: { flex: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cancel: { alignSelf: 'flex-start' },
});
