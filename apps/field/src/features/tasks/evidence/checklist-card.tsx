import type { ProjectTask } from '@oneohm/api-contracts';
import { Card, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { TASK } from '@/copy/tasks';
import { RequirementRow } from './requirement-row';

/**
 * The task's checklist (PRD 4.4). Ticks stay on the phone until the task is completed,
 * when they are saved with the facts; every item is needed to complete.
 */
export function ChecklistCard({
  task,
  ticked,
  onToggle,
}: {
  readonly task: ProjectTask;
  readonly ticked: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
}) {
  const theme = useTheme();
  if (task.checklist.length === 0) return null;
  const open = task.status !== 'completed' && task.status !== 'in_review';
  const done = task.checklist.filter((item) => ticked.has(item.key)).length;
  const all = done === task.checklist.length;
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.titleRow}>
          <Text variant="titleMd" style={styles.flex}>
            {TASK.checklist.title}
          </Text>
          <Text variant="label" tone="secondary">
            {TASK.checklist.progress(done, task.checklist.length)}
          </Text>
        </View>
        <Text variant="bodySm" tone="secondary">
          {TASK.checklist.body}
        </Text>
      </View>
      {all && open ? <RequirementRow state="done" label={TASK.checklist.allDone} /> : null}
      <View>
        {task.checklist.map((item, index) => {
          const checked = ticked.has(item.key);
          return (
            <PressableScale
              key={item.key}
              onPress={() => onToggle(item.key)}
              disabled={!open}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: !open }}
              accessibilityLabel={item.label}
              style={[
                styles.item,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <View
                style={[
                  styles.box,
                  checked
                    ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                    : { borderColor: theme.colors.borderStrong },
                ]}
              >
                {checked ? <Check size={14} color={theme.colors.onAccent} strokeWidth={3} /> : null}
              </View>
              <Text variant="body" style={styles.flex}>
                {item.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  heading: { gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 48 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
