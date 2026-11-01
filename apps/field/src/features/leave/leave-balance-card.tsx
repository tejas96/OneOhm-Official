import type { MyWorkday } from '@oneohm/api-contracts';
import { Card, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { LEAVE_CARD } from '@/copy/engagement';

const leftOf = (balance: MyWorkday['balances'][number]) =>
  Math.max(0, balance.allowedHalfDays - balance.usedHalfDays - balance.pendingHalfDays);

/** Leave left this year and a quick way to ask for more (PRD 4.1), as a Today tile. */
export function LeaveBalanceCard({ workday }: { readonly workday: MyWorkday }) {
  const theme = useTheme();
  const [main, ...others] = workday.balances;
  if (!main) return null;
  const waiting = workday.balances.reduce((sum, balance) => sum + balance.pendingHalfDays, 0);
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {LEAVE_CARD.overline}
      </Text>
      <View>
        <Text variant="titleLg">{LEAVE_CARD.days(leftOf(main))}</Text>
        <Text variant="label" tone="tertiary">
          {LEAVE_CARD.leftOf(main.label)}
        </Text>
      </View>
      {others.map((balance) => (
        <Text key={balance.leaveType} variant="label" tone="secondary">
          {LEAVE_CARD.other(balance.label, leftOf(balance))}
        </Text>
      ))}
      {waiting > 0 ? (
        <Text variant="label" tone="tertiary">
          {LEAVE_CARD.waiting(waiting)}
        </Text>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/leave/new')}
        style={styles.link}
      >
        <Text variant="label" tone="accent">
          {LEAVE_CARD.request}
        </Text>
        <ChevronRight size={14} color={theme.colors.accent} />
      </PressableScale>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 6, padding: 16 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 'auto', paddingTop: 4 },
});
