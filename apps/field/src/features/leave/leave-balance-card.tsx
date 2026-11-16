import type { MyWorkday } from '@oneohm/api-contracts';
import { Card, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { LEAVE_CARD } from '@/copy/engagement';

type Balance = MyWorkday['balances'][number];
const leftOf = (balance: Balance) =>
  Math.max(0, balance.allowedHalfDays - balance.usedHalfDays - balance.pendingHalfDays);
/** Unpaid leave has no balance: the line says the days taken, never "0 of 0". */
const lineOf = (balance: Balance) =>
  balance.paid === false
    ? LEAVE_CARD.unpaid(balance.usedHalfDays + balance.pendingHalfDays)
    : LEAVE_CARD.other(balance.label, leftOf(balance));

/** Leave left this year and a quick way to ask for more (PRD 4.1), as a Today tile. */
export function LeaveBalanceCard({ workday }: { readonly workday: MyWorkday }) {
  const theme = useTheme();
  // The first paid kind leads; unpaid kinds follow as a line.
  const paid = workday.balances.filter((balance) => balance.paid !== false);
  const main = paid[0];
  const others = workday.balances.filter((balance) => balance !== main);
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
          {lineOf(balance)}
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
