import { Card, ProgressRing, Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { TODAY } from '@/copy/tasks';

/** The one hero moment on Today: on-time share and the three counts, on the ocean panel. */
export function DayCard({
  onTime,
  overdue,
  today,
  upcoming,
}: {
  readonly onTime: number;
  readonly overdue: number;
  readonly today: number;
  readonly upcoming: number;
}) {
  const theme = useTheme();
  const percent = Math.round(onTime * 100);
  const counts = [
    {
      key: 'overdue',
      value: overdue,
      color: overdue > 0 ? theme.status.overdue.solid : theme.ocean.onPanelMuted,
    },
    { key: 'today', value: today, color: theme.brand.green },
    { key: 'upcoming', value: upcoming, color: theme.ocean.onPanelMuted },
  ] as const;
  return (
    <Card tone="ocean" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="overline" tone="onPanelMuted" color={theme.ocean.onPanelMuted}>
            {TODAY.dayCard}
          </Text>
          <View style={styles.counts}>
            {counts.map((count) => (
              <View key={count.key} style={styles.count}>
                <Text variant="displayLg" color={theme.ocean.onPanel}>
                  {count.value}
                </Text>
                <View style={styles.label}>
                  <View style={[styles.dot, { backgroundColor: count.color }]} />
                  <Text variant="label" color={theme.ocean.onPanelMuted}>
                    {TODAY.counts[count.key]}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <ProgressRing value={onTime} size={84} thickness={8} label={TODAY.onTimeAria(percent)}>
          <Text variant="titleLg" color={theme.ocean.onPanel}>
            {percent}%
          </Text>
          <Text variant="label" color={theme.ocean.onPanelMuted}>
            {TODAY.onTime}
          </Text>
        </ProgressRing>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  text: { flex: 1, gap: 12 },
  counts: { flexDirection: 'row', gap: 18 },
  count: { gap: 2 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
