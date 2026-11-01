import type { SearchHit } from '@oneohm/api-contracts';
import { Button, Card, Sheet, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Phone } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { COMMON } from '@/copy/common';
import { SEARCH } from '@/copy/search';
import { TASK } from '@/copy/tasks';
import { relativeDate } from '@/lib/dates';
import { detailLine } from './search-groups';
import { stateWords } from './search-row';

/**
 * A found project or customer, which have no screen of their own in the field app: the
 * facts, a call button, and for a project the person's own open tasks on it.
 */
export function RecordSheet({
  hit,
  onClose,
}: {
  readonly hit: SearchHit | null;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const phone = hit?.phone ?? null;
  return (
    <Sheet
      open={hit !== null}
      onClose={onClose}
      title={hit?.title ?? ''}
      description={hit ? detailLine(hit, stateWords(hit)) : undefined}
      closeLabel={COMMON.close}
    >
      <View style={styles.body}>
        {phone ? (
          <Button
            label={SEARCH.callButton}
            variant="secondary"
            accessibilityHint={SEARCH.call(hit?.title ?? '')}
            icon={<Phone size={16} color={theme.colors.textPrimary} />}
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          />
        ) : (
          <Text variant="bodySm" tone="secondary">
            {SEARCH.noPhone}
          </Text>
        )}
        {hit?.type === 'projects' ? <MyTasksOn projectId={hit.id} onLeave={onClose} /> : null}
      </View>
    </Sheet>
  );
}

/** The person's open tasks on one project, from the list Today already loads. */
function MyTasksOn({
  projectId,
  onLeave,
}: {
  readonly projectId: string;
  readonly onLeave: () => void;
}) {
  const mine = useQuery({ queryKey: keys.tasks, queryFn: () => unwrap(api.tasks.myTasks()) });
  const tasks = (mine.data ?? []).filter((task) => task.projectId === projectId);
  return (
    <View style={styles.tasks}>
      <Text variant="overline" tone="tertiary">
        {SEARCH.yourTasks}
      </Text>
      {mine.data && tasks.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {SEARCH.noTasks}
        </Text>
      ) : null}
      {tasks.map((task) => (
        <Card
          key={task.id}
          accessibilityLabel={task.title}
          onPress={() => {
            onLeave();
            router.push(`/tasks/${task.id}`);
          }}
          style={styles.task}
        >
          <Text variant="body" numberOfLines={1}>
            {task.title}
          </Text>
          <Text variant="label" tone="secondary">
            {TASK.status[task.status]} · {TASK.due(relativeDate(task.dueDate))}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingBottom: 8 },
  tasks: { gap: 8 },
  task: { gap: 2, paddingVertical: 12 },
});
