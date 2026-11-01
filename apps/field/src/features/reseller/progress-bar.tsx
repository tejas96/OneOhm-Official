import { useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';

/** A thin bar for the share of a project's work that is done. */
export function ProgressBar({ value, label }: { readonly value: number; readonly label: string }) {
  const theme = useTheme();
  const percent = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      style={[styles.track, { backgroundColor: theme.colors.surfaceSunken }]}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
