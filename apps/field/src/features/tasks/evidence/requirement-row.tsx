import { Text, useTheme } from '@oneohm/mobile-ui';
import { CircleAlert, CircleCheck, CloudUpload } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

export type RequirementState = 'needed' | 'waiting' | 'done';

/** One line of what a task still needs: missing, saved and waiting to upload, or in. */
export function RequirementRow({
  state,
  label,
}: {
  readonly state: RequirementState;
  readonly label: string;
}) {
  const theme = useTheme();
  const tone =
    state === 'done'
      ? theme.status.onTrack
      : state === 'waiting'
        ? theme.status.waiting
        : theme.status.overdue;
  const Icon = state === 'done' ? CircleCheck : state === 'waiting' ? CloudUpload : CircleAlert;
  return (
    <View
      style={[styles.row, { backgroundColor: tone.tint }]}
      accessibilityRole={state === 'needed' ? 'alert' : 'text'}
    >
      <Icon size={16} color={tone.fg} />
      <Text variant="bodySm" color={tone.fg} style={styles.flex}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  flex: { flex: 1 },
});
