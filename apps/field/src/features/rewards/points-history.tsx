import type { PointsEntry } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { REWARDS } from '@/copy/engagement';
import { dayOf } from './format';

/** Every approved points entry, newest first: why, from where, when and how many. */
export function PointsHistory({ entries }: { readonly entries: readonly PointsEntry[] }) {
  const theme = useTheme();
  if (entries.length === 0)
    return (
      <Text variant="bodySm" tone="secondary">
        {REWARDS.noHistory}
      </Text>
    );
  return (
    <Card style={styles.card}>
      {entries.map((entry, index) => (
        <View
          key={entry.id}
          style={[
            styles.row,
            index > 0 ? [styles.divided, { borderTopColor: theme.colors.borderSubtle }] : null,
          ]}
        >
          <View style={styles.text}>
            <Text variant="bodySm">{entry.reason}</Text>
            <Text variant="label" tone="tertiary">
              {REWARDS.source[entry.sourceType]} · {dayOf(entry.createdAt)}
            </Text>
          </View>
          {entry.points === 0 ? (
            <Text variant="label" color={theme.status.atRisk.fg}>
              {REWARDS.missedPoints}
            </Text>
          ) : (
            <Text variant="titleMd" tone="accent">
              {REWARDS.points(entry.points)}
            </Text>
          )}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: 2 },
});
