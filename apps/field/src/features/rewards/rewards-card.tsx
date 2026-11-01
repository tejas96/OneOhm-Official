import type { MyWorkday } from '@oneohm/api-contracts';
import { Card, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { REWARDS, REWARDS_CARD } from '@/copy/engagement';
import { useMyRewards } from './use-rewards';

/** Points this month, the latest entry and achievements, with the way in (PRD 4.1). */
export function RewardsCard({ workday }: { readonly workday: MyWorkday }) {
  const theme = useTheme();
  const rewards = useMyRewards();
  const earned = rewards.data?.achievements.filter((item) => item.earned).length ?? 0;
  const latest = workday.points.recent[0];
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {REWARDS_CARD.overline}
      </Text>
      <View>
        <Text variant="titleLg">{REWARDS_CARD.points(workday.points.thisMonth)}</Text>
        <Text variant="label" tone="tertiary">
          {REWARDS_CARD.thisMonth} · {REWARDS_CARD.total(workday.points.total)}
        </Text>
      </View>
      {latest ? (
        <Text variant="label" tone="secondary" numberOfLines={2}>
          {REWARDS.points(latest.points)} {latest.reason}
        </Text>
      ) : (
        <Text variant="label" tone="secondary">
          {REWARDS_CARD.none}
        </Text>
      )}
      {earned > 0 ? (
        <View style={styles.badge}>
          <Sparkles size={13} color={theme.colors.accent} />
          <Text variant="label" tone="secondary">
            {REWARDS_CARD.earned(earned)}
          </Text>
        </View>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/rewards')}
        style={styles.link}
      >
        <Text variant="label" tone="accent">
          {REWARDS_CARD.see}
        </Text>
        <ChevronRight size={14} color={theme.colors.accent} />
      </PressableScale>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 6, padding: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 'auto', paddingTop: 4 },
});
