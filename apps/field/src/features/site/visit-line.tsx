import type { SiteVisit } from '@oneohm/api-contracts';
import { StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { MapPin, MapPinOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SITE } from '@/copy/site';
import { clockTime } from '@/lib/dates';

/** How far from the saved site a check-in was, with the far flag; or why it is unknown. */
export function VisitDistance({ visit }: { readonly visit: SiteVisit }) {
  const theme = useTheme();
  if (visit.checkInDistanceM === null) {
    return (
      <View style={styles.row}>
        <MapPinOff size={14} color={theme.colors.textTertiary} />
        <Text variant="label" tone="tertiary">
          {visit.locationNote === 'site_unknown' ? SITE.siteUnknown : SITE.notShared}
        </Text>
      </View>
    );
  }
  if (visit.farFromSite) {
    return (
      <View style={styles.row}>
        <StatusPill size="sm" tone="atRisk" label={SITE.farBadge} />
        <Text variant="label" color={theme.status.atRisk.fg} style={styles.shrink}>
          {SITE.far(visit.checkInDistanceM)}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <MapPin size={14} color={theme.colors.textTertiary} />
      <Text variant="label" tone="tertiary">
        {SITE.fromSite(visit.checkInDistanceM)}
      </Text>
    </View>
  );
}

/** A finished or open visit in one line: when, how long, how far. */
export function VisitLine({ visit }: { readonly visit: SiteVisit }) {
  return (
    <View style={styles.visit}>
      <Text variant="bodySm">
        {visit.checkOutAt
          ? SITE.visit(
              clockTime(visit.checkInAt),
              clockTime(visit.checkOutAt),
              visit.durationMinutes ?? 0,
            )
          : SITE.inSince(clockTime(visit.checkInAt))}
      </Text>
      <VisitDistance visit={visit} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  visit: { gap: 4 },
});
