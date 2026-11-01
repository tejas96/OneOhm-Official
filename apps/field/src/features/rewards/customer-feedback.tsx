import type { MyRewards } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { Star } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { REWARDS } from '@/copy/engagement';
import { dayOf } from './format';

const STARS = [1, 2, 3, 4, 5] as const;

/** What customers said when they named this person on a stage rating; read only. */
export function CustomerFeedback({ feedback }: { readonly feedback: MyRewards['feedback'] }) {
  const theme = useTheme();
  if (feedback.length === 0)
    return (
      <Text variant="bodySm" tone="secondary">
        {REWARDS.noFeedback}
      </Text>
    );
  return (
    <View style={styles.list}>
      {feedback.map((item) => (
        <Card key={item.id} style={styles.card}>
          <View style={styles.head}>
            <Text variant="mono" tone="tertiary">
              {item.projectCode} · {REWARDS.stages[item.stage] ?? item.stage}
            </Text>
            <Text variant="label" tone="tertiary">
              {dayOf(item.createdAt)}
            </Text>
          </View>
          <View style={styles.stars} accessibilityLabel={REWARDS.stars(item.stars)}>
            {STARS.map((value) => (
              <Star
                key={value}
                size={16}
                color={value <= item.stars ? theme.colors.accent : theme.colors.textTertiary}
                fill={value <= item.stars ? theme.colors.accent : 'transparent'}
              />
            ))}
          </View>
          <Text variant="body" tone={item.comment ? 'primary' : 'tertiary'}>
            {item.comment ? `“${item.comment}”` : REWARDS.noComment}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: { gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stars: { flexDirection: 'row', gap: 2 },
});
