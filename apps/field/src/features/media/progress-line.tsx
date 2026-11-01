import { useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';

/** A thin bar for recording time or playback position (0 to 1). */
export function ProgressLine({
  value,
  tone = 'accent',
}: {
  readonly value: number;
  readonly tone?: 'accent' | 'recording';
}) {
  const theme = useTheme();
  const fill = tone === 'recording' ? theme.status.overdue.solid : theme.colors.accent;
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { backgroundColor: theme.colors.borderSubtle }]}>
      <View style={[styles.fill, { width, backgroundColor: fill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: 4, borderRadius: 2 },
});
