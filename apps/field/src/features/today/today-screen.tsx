import {
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  localHours,
  Screen,
  skyPhase,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { Sun } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { TODAY } from '@/copy/tasks';
import { AttendanceCard } from '@/features/attendance/attendance-card';
import { useWorkday } from '@/features/attendance/use-workday';
import { TaskRow } from '@/features/tasks/task-row';
import { BUSINESS_TIME_ZONE, businessToday, longToday } from '@/lib/dates';
import { useCurrentUser } from '@/session/session-provider';
import { groupTasks, onTimeShare, TASK_GROUPS } from '../tasks/task-groups';
import { DayCard } from './day-card';
import { QuickActions } from './quick-actions';

/** What the person should do today, grouped so the late and the blocked are obvious. */
export function TodayScreen() {
  const theme = useTheme();
  const user = useCurrentUser();
  const query = useQuery({ queryKey: keys.tasks, queryFn: () => unwrap(api.tasks.myTasks()) });
  const workday = useWorkday();
  const phase = skyPhase(localHours(new Date(), BUSINESS_TIME_ZONE));
  const firstName = user.fullName.split(' ')[0] ?? user.fullName;
  const tasks = query.data ?? [];
  const groups = groupTasks(tasks, businessToday());

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => {
        void query.refetch();
        void workday.refetch();
      }}
    >
      <View style={styles.header}>
        <Text variant="mono" tone="tertiary">
          {longToday().toUpperCase()}
        </Text>
        <View>
          <Text variant="displayXl">{TODAY.greeting[phase]},</Text>
          <Text variant="displayXl" italic color={theme.colors.accent}>
            {firstName}.
          </Text>
        </View>
        {query.data ? (
          <Text variant="body" tone="secondary">
            {TODAY.summary(tasks.length, groups.overdue.length)}
          </Text>
        ) : null}
      </View>

      {workday.data ? <AttendanceCard workday={workday.data} /> : null}
      {query.isPending ? <LoadingState label={TODAY.loading} /> : null}
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
          <DayCard
            onTime={onTimeShare(groups)}
            overdue={groups.overdue.length}
            today={groups.today.length}
            upcoming={groups.upcoming.length}
          />
          <QuickActions />
          {tasks.length === 0 ? (
            <EmptyState
              icon={<Sun size={22} color={theme.colors.accent} />}
              title={TODAY.emptyTitle}
              description={TODAY.emptyBody}
            />
          ) : (
            TASK_GROUPS.filter((group) => groups[group].length > 0).map((group) => (
              <View key={group} style={styles.group}>
                <SectionTitle title={TODAY.groups[group]} count={groups[group].length} />
                {groups[group].map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </View>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 8 },
  group: { gap: 10 },
});
