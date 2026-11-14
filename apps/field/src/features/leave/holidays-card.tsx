import type { StaffCalendar } from '@oneohm/api-contracts';
import { staffHours } from '@oneohm/domain';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { daysBetween } from '@oneohm/shared';
import { CalendarHeart, Clock } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { CALENDAR } from '@/copy/calendar';
import { businessToday, shortDate } from '@/lib/dates';

const SHOWN = 5;

function whenText(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return CALENDAR.today;
  if (diff === 1) return CALENDAR.tomorrow;
  return CALENDAR.inDays(diff);
}

/** Working days and hours, and the next holidays (Settings → Working time & holidays). */
export function HolidaysCard({ calendar }: { readonly calendar: StaffCalendar }) {
  const theme = useTheme();
  const today = businessToday();
  const week = staffHours(calendar);
  const ahead = calendar.upcomingHolidays.filter((holiday) => holiday.day >= today);
  const shown = ahead.slice(0, SHOWN);
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Clock size={16} color={theme.colors.accent} />
        <Text variant="overline" tone="tertiary">
          {CALENDAR.overline}
        </Text>
      </View>
      <Text variant="titleMd">{`${week.days} · ${week.hours}`}</Text>
      {week.lunch ? (
        <Text variant="label" tone="secondary">
          {CALENDAR.lunch(week.lunch)}
        </Text>
      ) : null}
      <View style={[styles.rule, { backgroundColor: theme.colors.borderSubtle }]} />
      <View style={styles.row}>
        <CalendarHeart size={16} color={theme.colors.accent} />
        <Text variant="overline" tone="tertiary">
          {CALENDAR.holidays}
        </Text>
      </View>
      {shown.length === 0 ? (
        <Text variant="label" tone="secondary">
          {CALENDAR.none}
        </Text>
      ) : (
        shown.map((holiday) => (
          <View key={holiday.day} style={styles.holiday}>
            <View style={styles.name}>
              <Text variant="body">{holiday.name}</Text>
              <Text variant="label" tone="tertiary">
                {shortDate(holiday.day)}
              </Text>
            </View>
            <Text variant="label" tone="accent">
              {whenText(holiday.day, today)}
            </Text>
          </View>
        ))
      )}
      {ahead.length > SHOWN ? (
        <Text variant="label" tone="tertiary">
          {CALENDAR.more(ahead.length - SHOWN)}
        </Text>
      ) : null}
      {shown.length > 0 ? (
        <Text variant="label" tone="tertiary">
          {CALENDAR.notCounted}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  holiday: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1, gap: 2 },
});
