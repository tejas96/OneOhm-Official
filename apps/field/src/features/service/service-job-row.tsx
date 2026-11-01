import type { ServiceJob } from '@oneohm/api-contracts';
import { Card, StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SERVICE } from '@/copy/service';
import { nextPromise, placeLine, slaTone } from './service-times';

/** One service request on Today: what, who and where, and the next promised time. */
export function ServiceJobRow({ job }: { readonly job: ServiceJob }) {
  const theme = useTheme();
  const promise = nextPromise(job);
  return (
    <Card
      onPress={() => router.push({ pathname: '/service/[id]', params: { id: job.id } })}
      accessibilityLabel={`${job.categoryLabel}, ${job.customer.name}`}
      style={styles.card}
    >
      <View style={styles.top}>
        <Text variant="mono" tone="tertiary" numberOfLines={1} style={styles.flex}>
          {SERVICE.overline(job.projectCode)}
        </Text>
        <ChevronRight size={18} color={theme.colors.textTertiary} />
      </View>
      <Text variant="titleMd" numberOfLines={1}>
        {job.categoryLabel}
      </Text>
      <Text variant="bodySm" tone="secondary" numberOfLines={2}>
        {job.description}
      </Text>
      <View style={styles.place}>
        <MapPin size={14} color={theme.colors.textTertiary} />
        <Text variant="label" tone="tertiary" numberOfLines={1} style={styles.flex}>
          {placeLine(job)}
        </Text>
      </View>
      <View style={styles.bottom}>
        {job.checkedIn ? <StatusPill size="sm" tone="onTrack" label={SERVICE.onSite} /> : null}
        {promise ? (
          <StatusPill
            size="sm"
            tone={promise.state ? slaTone(promise.state) : 'neutral'}
            label={`${promise.label} ${promise.when}`}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
});
