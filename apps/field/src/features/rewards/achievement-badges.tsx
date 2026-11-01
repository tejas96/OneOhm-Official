import type { MyRewards } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { Award } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { REWARDS } from '@/copy/engagement';

/** Earned badges in colour; the rest faded with how far the person has come. */
export function AchievementBadges({
  achievements,
}: {
  readonly achievements: MyRewards['achievements'];
}) {
  const theme = useTheme();
  return (
    <View style={styles.grid}>
      {achievements.map((item) => {
        const words = REWARDS.achievements[item.key];
        return (
          <Card
            key={item.key}
            tone={item.earned ? 'raised' : 'sunken'}
            style={styles.badge}
            accessibilityLabel={`${words.title}. ${words.body}`}
          >
            <View
              style={[
                styles.icon,
                {
                  backgroundColor: item.earned
                    ? theme.colors.accentSoft
                    : theme.colors.surfaceRaised,
                },
              ]}
            >
              <Award
                size={18}
                color={item.earned ? theme.colors.onAccentSoft : theme.colors.textTertiary}
              />
            </View>
            <Text variant="titleMd" tone={item.earned ? 'primary' : 'secondary'}>
              {words.title}
            </Text>
            <Text variant="label" tone="tertiary">
              {words.body}
            </Text>
            <Text variant="mono" tone={item.earned ? 'accent' : 'tertiary'}>
              {item.earned ? REWARDS.earnedBadge : REWARDS.progress(item.current, item.target)}
            </Text>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { gap: 4, flexBasis: '47%', flexGrow: 1, padding: 14 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
