import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { Card, formatInr, Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { MONTH } from '@/copy/month';
import {
  dayMonth,
  formatDays,
  formatHours,
  lastDayOf,
  monthTitle,
  plainDays,
} from './month-format';

/** The big payable-days number on the ocean panel, and what it is counted to. */
export function PayableHero({ sheet }: { readonly sheet: MonthSheetPerson }) {
  const theme = useTheme();
  const { counts } = sheet.row;
  const done = sheet.lock.status === 'locked' || counts.countedTo === lastDayOf(sheet.lock.month);
  const period = done
    ? MONTH.period.whole(monthTitle(sheet.lock.month))
    : MONTH.period.sofar(dayMonth(counts.countedTo));
  return (
    <Card tone="ocean" style={styles.hero}>
      <Text variant="overline" color={theme.ocean.onPanelMuted}>
        {MONTH.payableDays}
      </Text>
      <Text variant="hero" color={theme.ocean.onPanel}>
        {plainDays(counts.payableDays)}
      </Text>
      <Text variant="label" color={theme.ocean.onPanelMuted}>
        {period}
      </Text>
    </Card>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text variant="body" tone="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text variant={strong ? 'titleMd' : 'body'}>{value}</Text>
    </View>
  );
}

/** The same counts HR sees: days, late rule, travel, bonuses and (when shown) gross pay. */
export function MonthNumbers({ sheet }: { readonly sheet: MonthSheetPerson }) {
  const { counts, money } = sheet.row;
  const rows = MONTH.rows;
  const gross = sheet.showsPay ? money.grossPaise : null;
  return (
    <>
      <Card style={styles.card}>
        <Row label={rows.present} value={formatDays(counts.present)} />
        <Row label={rows.halfDays} value={String(counts.halfDays)} />
        <Row label={rows.absent} value={formatDays(counts.absent)} />
        <Row label={rows.paidLeave} value={formatDays(counts.paidLeave)} />
        <Row label={rows.unpaidLeave} value={formatDays(counts.unpaidLeave)} />
        <Row label={rows.offs} value={formatDays(counts.holidays + counts.weeklyOffs)} />
        {counts.unpaidOffs > 0 ? (
          <Text variant="label" tone="tertiary">
            {MONTH.unpaidOffs(formatDays(counts.unpaidOffs))}
          </Text>
        ) : null}
        <Row label={rows.lates} value={String(counts.lates)} />
        {sheet.rules.lateEvery > 0 ? (
          <Text variant="label" tone="tertiary">
            {MONTH.lateRule(
              sheet.rules.lateEvery,
              counts.lateDeduction,
              formatDays(counts.lateDeduction),
            )}
          </Text>
        ) : null}
        <Row label={rows.hours} value={formatHours(counts.workedMinutes)} />
      </Card>
      <Card style={styles.card}>
        <Row label={rows.travelApproved} value={formatInr(money.travelApprovedPaise)} strong />
        <Row label={rows.travelPaid} value={formatInr(money.travelPaidPaise)} />
        <Row label={rows.travelWaiting} value={formatInr(money.travelPendingPaise)} />
        <Row label={rows.bonus} value={formatInr(money.bonusPaise)} />
      </Card>
      {gross !== null && money.monthlyPayPaise !== null ? (
        <Card style={styles.card}>
          <Row label={rows.gross} value={formatInr(gross)} strong />
          <Text variant="label" tone="secondary">
            {MONTH.grossMath(
              formatInr(money.monthlyPayPaise),
              plainDays(counts.payableDays),
              counts.daysInMonth,
              formatInr(gross),
            )}
          </Text>
          <Text variant="label" tone="tertiary">
            {MONTH.grossNote}
          </Text>
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, gap: 2 },
  card: { gap: 10, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
});
