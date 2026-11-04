import type { MyRewards } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { REWARDS } from '@/copy/engagement';
import { dayOf } from './format';
import { ratePercent } from './rate';

/**
 * This India month (spec 3.7): how the person's work was judged, and every part they
 * missed with the reason. A missed part earns nothing; nothing is ever taken away.
 */
export function MonthCard({ month }: { readonly month: MyRewards['month'] }) {
  const theme = useTheme();
  const tiles = [
    { label: REWARDS.month.onTime, value: ratePercent(month.onTimeRate) },
    { label: REWARDS.month.firstTime, value: ratePercent(month.firstTimeRate) },
    { label: REWARDS.month.tasks, value: String(month.tasksJudged) },
  ];
  return (
    <Card style={styles.card}>
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View key={tile.label} style={styles.tile}>
            <Text variant="titleLg">{tile.value}</Text>
            <Text variant="label" tone="tertiary">
              {tile.label}
            </Text>
          </View>
        ))}
      </View>
      {month.missed.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {month.tasksJudged === 0 ? REWARDS.month.noneJudged : REWARDS.month.noneMissed}
        </Text>
      ) : (
        month.missed.map((line) => (
          <View key={`${line.createdAt}-${line.reason}`} style={styles.missed}>
            <Text variant="bodySm" style={styles.flex}>
              {line.reason}
            </Text>
            <Text variant="label" color={theme.status.atRisk.fg}>
              {dayOf(line.createdAt)}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 2 },
  missed: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1 },
});
