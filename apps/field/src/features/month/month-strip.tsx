import { Card, formatInr, StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { MONTH_CARD } from '@/copy/month';
import { businessToday } from '@/lib/dates';
import { formatDays, monthOf } from './month-format';
import { notOnSheet, useHasMonth, useMyMonth } from './use-my-month';

/**
 * Today's "My month" strip: payable days so far and travel approved this month, with a
 * Final badge once HR locks the month. Cached like the other Today cards; a failure shows a
 * quiet retry line, never a blocking state. Only staff have a month sheet: anyone else (or
 * someone the sheet does not list) sees no card, and nothing is asked again.
 */
export function MonthStrip() {
  const theme = useTheme();
  const allowed = useHasMonth();
  const query = useMyMonth(monthOf(businessToday()));
  const open = () => router.push('/month');
  if (!allowed || notOnSheet(query.error)) return null;
  if (query.isPending && !query.data) {
    return (
      <Card style={styles.card}>
        <Text variant="overline" tone="tertiary">
          {MONTH_CARD.overline}
        </Text>
        <Text variant="label" tone="tertiary">
          {MONTH_CARD.loading}
        </Text>
      </Card>
    );
  }
  if (!query.data) {
    return (
      <Card
        style={styles.card}
        onPress={() => void query.refetch()}
        accessibilityLabel={MONTH_CARD.retry}
      >
        <Text variant="overline" tone="tertiary">
          {MONTH_CARD.overline}
        </Text>
        <Text variant="label" tone="secondary">
          {MONTH_CARD.failed}
        </Text>
      </Card>
    );
  }
  const { row, lock } = query.data;
  const { money } = row;
  return (
    <Card style={styles.card} onPress={open} accessibilityLabel={MONTH_CARD.see}>
      <View style={styles.head}>
        <Text variant="overline" tone="tertiary">
          {MONTH_CARD.overline}
        </Text>
        {lock.status === 'locked' ? (
          <StatusPill size="sm" tone="onTrack" label={MONTH_CARD.final} />
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.flex}>
          <Text variant="titleLg">{formatDays(row.counts.payableDays)}</Text>
          <Text variant="label" tone="tertiary">
            {lock.status === 'locked' ? MONTH_CARD.payableDone : MONTH_CARD.payable}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="titleLg">{formatInr(money.travelApprovedPaise)}</Text>
          <Text variant="label" tone="tertiary">
            {money.travelApprovedPaise === 0
              ? MONTH_CARD.noTravel
              : money.travelPaidPaise > 0
                ? `${MONTH_CARD.travel} · ${MONTH_CARD.travelPaid(formatInr(money.travelPaidPaise))}`
                : MONTH_CARD.travel}
          </Text>
        </View>
        <ChevronRight size={18} color={theme.colors.accent} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
});
