import type { TravelDay } from '@oneohm/api-contracts';
import { Card, formatInr, Text, useTheme } from '@oneohm/mobile-ui';
import { ArrowDown, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { TRAVEL } from '@/copy/site';

function Stop({ label }: { readonly label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.stop}>
      <MapPin size={14} color={theme.colors.accent} />
      <Text variant="bodySm" style={styles.shrink}>
        {label}
      </Text>
    </View>
  );
}

type Leg = TravelDay['legs'][number];

/** Stable keys for legs, which can repeat (two visits to one site). */
function keyed(legs: readonly Leg[]) {
  const seen = new Map<string, number>();
  return legs.map((leg) => {
    const base = `${leg.fromLabel}>${leg.toLabel}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { leg, key: `${base}#${count}`, first: leg === legs[0] };
  });
}

/** The day's stops in order with the straight-line distance between them, and the total. */
export function RouteCard({ day }: { readonly day: TravelDay }) {
  const theme = useTheme();
  if (day.visits.length === 0)
    return (
      <Card tone="sunken">
        <Text variant="bodySm" tone="secondary">
          {TRAVEL.noVisits}
        </Text>
      </Card>
    );
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="label" tone="tertiary">
          {TRAVEL.route}
        </Text>
        <Text variant="label" tone="tertiary">
          {TRAVEL.routeHint}
        </Text>
      </View>
      <View style={styles.legs}>
        {keyed(day.legs).map(({ leg, key, first }) => (
          <View key={key} style={styles.leg}>
            {first ? <Stop label={leg.fromLabel} /> : null}
            <View style={styles.distance}>
              <ArrowDown size={14} color={theme.colors.textTertiary} />
              <Text variant="label" tone="tertiary">
                {leg.distanceM === null ? TRAVEL.unpaidLeg : TRAVEL.distance(leg.distanceM)}
              </Text>
            </View>
            <Stop label={leg.toLabel} />
          </View>
        ))}
      </View>
      <Text variant="titleMd">
        {TRAVEL.total(day.distanceM, formatInr(day.ratePaisePerKm), formatInr(day.amountPaise))}
      </Text>
      {day.unlocated > 0 ? (
        <Text variant="bodySm" tone="secondary">
          {TRAVEL.unlocated(day.unlocated)}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { gap: 2 },
  legs: { gap: 6 },
  leg: { gap: 6 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distance: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 1 },
  shrink: { flexShrink: 1 },
});
