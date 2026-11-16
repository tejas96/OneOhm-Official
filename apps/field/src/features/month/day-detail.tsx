import type { MonthDayRecord } from '@oneohm/api-contracts';
import { Card, StatusPill, Text } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { MONTH } from '@/copy/month';
import { clockTime } from '@/lib/dates';
import { statusLabel, toneOf } from './day-status';
import { dayTitle, formatHours } from './month-format';

/** What one tapped day counts as: times, hours, leave or holiday name, and what is open. */
function timesOf(day: MonthDayRecord): string[] {
  const text = MONTH.day;
  return [
    day.checkInAt ? text.checkIn(clockTime(day.checkInAt)) : null,
    day.checkOutAt ? text.checkOut(clockTime(day.checkOutAt)) : null,
    day.onDuty ? text.onDuty : null,
  ].filter((part): part is string => part !== null);
}

function leaveOf(day: MonthDayRecord): string | null {
  if (!day.leave) return null;
  const text = MONTH.day;
  return day.leave.half
    ? text.halfLeave(day.leave.label)
    : text.leave(day.leave.label, day.leave.paid);
}

function notesOf(day: MonthDayRecord): string[] {
  const text = MONTH.day;
  return [
    day.holidayName,
    leaveOf(day),
    day.workedOnDayOff ? text.dayOff : null,
    day.late ? MONTH.marks.late : null,
    day.autoClosed ? MONTH.marks.autoClosed : null,
    day.tapDelayed ? text.tapDelayed : null,
    day.doubtfulVisit ? MONTH.marks.doubtful : null,
    day.pendingLeave ? text.pendingLeave : null,
    day.openCorrection ? text.correction : null,
    day.openAlert ? text.alert : null,
  ].filter((part): part is string => part !== null);
}

const COUNTED = ['present', 'half_day', 'absent'];

export function DayDetail({ day }: { readonly day: MonthDayRecord }) {
  const tone = toneOf(day.status);
  const text = MONTH.day;
  const times = timesOf(day);
  const notes = notesOf(day);
  return (
    <Card tone="sunken" style={styles.card}>
      <View style={styles.head}>
        <Text variant="titleMd">{dayTitle(day.date)}</Text>
        {tone ? <StatusPill size="sm" tone={tone} label={statusLabel(day.status)} /> : null}
        {!tone ? (
          <Text variant="label" tone="tertiary">
            {statusLabel(day.status)}
          </Text>
        ) : null}
      </View>
      {times.length > 0 ? (
        <Text variant="body">
          {times.join('  ·  ')}
          {day.workedMinutes ? `  ·  ${text.worked(formatHours(day.workedMinutes))}` : ''}
        </Text>
      ) : COUNTED.includes(day.status) ? (
        <Text variant="body" tone="secondary">
          {text.noCheckIn}
        </Text>
      ) : null}
      {notes.map((note) => (
        <Text key={note} variant="bodySm" tone="secondary">
          {note}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
