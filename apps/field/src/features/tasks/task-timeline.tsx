import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Card, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { shortMoment } from '@/lib/dates';

export const activityKey = (id: string) => ['tasks', 'activity', id] as const;

/**
 * The project's latest history under the task (PRD 4.2): ten lines, newest first, with
 * this task's own lines marked. Crews see only their own tasks' lines (the server filters).
 * Anyone working the task can post a progress update from here.
 */
export function TaskTimeline({
  task,
  canPost,
  onPost,
}: {
  readonly task: ProjectTask;
  readonly canPost: boolean;
  readonly onPost: () => void;
}) {
  const theme = useTheme();
  const query = useQuery({
    queryKey: activityKey(task.id),
    queryFn: () => unwrap(api.tasks.taskActivity({ params: { id: task.id } })),
  });
  const entries = query.data ?? [];
  let status: string | null = null;
  if (query.isPending) status = COMMON.loading;
  else if (query.isError) status = TASK.timeline.loadError;
  else if (entries.length === 0) status = TASK.timeline.empty;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text variant="overline" tone="tertiary">
          {TASK.timeline.title}
        </Text>
        {canPost ? (
          <Button label={TASK.postUpdate} size="sm" variant="quiet" onPress={onPost} />
        ) : null}
      </View>
      <Card style={styles.card}>
        {status ? (
          <Text variant="bodySm" tone="secondary">
            {status}
          </Text>
        ) : null}
        {entries.map((entry) => {
          const own = entry.taskId === task.id;
          const who = [entry.user?.fullName, shortMoment(entry.createdAt)].filter(Boolean);
          return (
            <View key={entry.id} style={styles.entry}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: own ? theme.colors.accent : theme.colors.borderStrong },
                ]}
              />
              <View style={styles.flex}>
                <Text variant="bodySm">{entry.message}</Text>
                <Text variant="label" tone="tertiary">
                  {own ? `${TASK.timeline.thisTask} · ${who.join(' · ')}` : who.join(' · ')}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  card: { gap: 14 },
  entry: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  flex: { flex: 1, gap: 2 },
});
