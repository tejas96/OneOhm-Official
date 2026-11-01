import type { ProjectTask } from '@oneohm/api-contracts';
import { Text, useTheme } from '@oneohm/mobile-ui';
import { RotateCcw } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { TASK } from '@/copy/tasks';

/** What the task is (from its template) and, when work came back, what to fix. */
export function TaskNotes({ task }: { readonly task: ProjectTask }) {
  const theme = useTheme();
  const done = task.status === 'completed';
  return (
    <>
      {task.description && !done ? (
        <Text variant="body" tone="secondary">
          {task.description}
        </Text>
      ) : null}
      {task.returned ? (
        <View
          style={[styles.box, { backgroundColor: theme.status.atRisk.tint }]}
          accessibilityRole="alert"
        >
          <View style={styles.row}>
            <RotateCcw size={16} color={theme.status.atRisk.fg} />
            <Text variant="titleMd" color={theme.status.atRisk.fg} style={styles.flex}>
              {TASK.returned.title(task.returned.by?.fullName ?? null)}
            </Text>
          </View>
          <Text variant="body">{task.returned.note}</Text>
          <Text variant="label" tone="secondary">
            {task.reworkCount > 1
              ? `${TASK.returned.body} ${TASK.returned.times(task.reworkCount)}.`
              : TASK.returned.body}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
