import type { MyWorkday } from '@oneohm/api-contracts';
import { StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { ATTENDANCE } from '@/copy/workforce';
import { clockTime } from '@/lib/dates';

/** When the person checked in and out today, and where. */
export function DayLine({ workday }: { readonly workday: MyWorkday }) {
  const theme = useTheme();
  const day = workday.today;
  if (!day)
    return (
      <Text variant="body" tone="secondary">
        {ATTENDANCE.notIn}
      </Text>
    );
  const place = day.place;
  return (
    <View style={styles.wrap}>
      <View style={styles.times}>
        <Text variant="titleMd">{ATTENDANCE.inAt(clockTime(day.checkInAt))}</Text>
        {day.late ? <StatusPill size="sm" tone="atRisk" label={ATTENDANCE.late} /> : null}
        {day.corrected ? (
          <StatusPill size="sm" tone="neutral" label={ATTENDANCE.corrected} />
        ) : null}
        {day.checkOutAt ? (
          <Text variant="titleMd" tone="secondary">
            {ATTENDANCE.outAt(clockTime(day.checkOutAt))}
          </Text>
        ) : null}
      </View>
      <View style={styles.place}>
        <MapPin size={14} color={theme.colors.textTertiary} />
        <Text variant="label" tone="tertiary">
          {place ? ATTENDANCE.at(place.name, place.inside, place.distanceM) : ATTENDANCE.noPlace}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  times: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
