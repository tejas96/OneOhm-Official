import type { MonthDayRecord } from '@oneohm/api-contracts';
import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { MONTH } from '@/copy/month';
import { LEGEND_ORDER, marksOf, statusLabel, toneOf } from './day-status';
import { MarkIcon } from './mark-icon';
import { calendarWeeks, dayMonth } from './month-format';

/** The month as a Mon-Sun grid; each day in its status colour, marks for late and doubt. */
export function MonthCalendar({
  days,
  today,
  selected,
  onSelect,
}: {
  readonly days: readonly MonthDayRecord[];
  readonly today: string;
  readonly selected: string | null;
  readonly onSelect: (date: string) => void;
}) {
  const weeks = calendarWeeks(days);
  return (
    <View style={styles.grid}>
      <View style={styles.week}>
        {MONTH.weekdays.map((name) => (
          <Text key={name} variant="label" tone="tertiary" style={styles.weekday}>
            {name}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week.find((cell) => cell)?.date ?? 'blank'} style={styles.week}>
          {week.map((day, index) =>
            day ? (
              <Cell
                key={day.date}
                day={day}
                isToday={day.date === today}
                isSelected={day.date === selected}
                onPress={() => onSelect(day.date)}
              />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: blank cells have no identity
              <View key={`blank-${index}`} style={styles.cell} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function Cell({
  day,
  isToday,
  isSelected,
  onPress,
}: {
  readonly day: MonthDayRecord;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  const tone = toneOf(day.status);
  const color = tone ? theme.status[tone] : null;
  const marks = marksOf(day);
  const ink = color ? color.fg : theme.colors.textTertiary;
  const ring = isSelected ? ink : isToday ? theme.colors.accent : (color?.tint ?? 'transparent');
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${dayMonth(day.date)}, ${statusLabel(day.status)}`}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      pressedScale={0.94}
      style={styles.cell}
    >
      <View
        style={[
          styles.inner,
          {
            backgroundColor: color ? color.tint : 'transparent',
            borderColor: color || isSelected || isToday ? ring : theme.colors.borderSubtle,
            borderWidth: isSelected || isToday ? 2 : StyleSheet.hairlineWidth,
            opacity: color || day.status === 'upcoming' ? 1 : 0.45,
          },
        ]}
      >
        <Text variant="bodySm" color={ink} style={styles.number}>
          {Number(day.date.slice(8))}
        </Text>
        <View style={styles.marks}>
          {marks.map((mark) => (
            <MarkIcon key={mark} mark={mark} size={9} color={ink} />
          ))}
        </View>
      </View>
    </PressableScale>
  );
}

/** What each colour and mark on this month's grid means; only what the month uses. */
export function MonthLegend({ days }: { readonly days: readonly MonthDayRecord[] }) {
  const theme = useTheme();
  const used = new Set(days.map((day) => day.status));
  const marks = new Set(days.flatMap(marksOf));
  return (
    <View style={styles.legend}>
      {LEGEND_ORDER.filter((status) => used.has(status)).map((status) => {
        const tone = toneOf(status);
        return (
          <View key={status} style={styles.item}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: tone ? theme.status[tone].solid : 'transparent' },
              ]}
            />
            <Text variant="label" tone="secondary">
              {statusLabel(status)}
            </Text>
          </View>
        );
      })}
      {(['late', 'autoClosed', 'doubtful', 'offUnpaid'] as const)
        .filter((mark) => marks.has(mark))
        .map((mark) => (
          <View key={mark} style={styles.item}>
            <MarkIcon mark={mark} size={12} color={theme.colors.textSecondary} />
            <Text variant="label" tone="secondary">
              {MONTH.marks[mark]}
            </Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, height: 52 },
  inner: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  number: { fontWeight: '600' },
  marks: { flexDirection: 'row', gap: 2, height: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, paddingTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
});
