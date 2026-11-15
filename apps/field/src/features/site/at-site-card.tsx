import type { SiteVisit } from '@oneohm/api-contracts';
import { Button, Card, Text } from '@oneohm/mobile-ui';
import { type Href, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FENCE } from '@/copy/site';
import { clock24 } from '@/lib/dates';
import { useOpenVisit } from './use-open-visit';

/** Where the job screen for a visit is: its task, or its service request. */
export function jobRoute(visit: Pick<SiteVisit, 'taskId' | 'serviceRequestId'>): Href | null {
  if (visit.taskId) return { pathname: '/tasks/[id]', params: { id: visit.taskId } };
  if (visit.serviceRequestId)
    return { pathname: '/service/[id]', params: { id: visit.serviceRequestId } };
  return null;
}

/**
 * "At Sharma home since 10:42" while a site visit is open, with a way into the job: open it,
 * add a photo or complete it, all on the existing job screen. Nothing when not checked in.
 */
export function AtSiteCard() {
  const visit = useOpenVisit().data;
  if (!visit) return null;
  const route = jobRoute(visit);
  const go = () => {
    if (route) router.push(route);
  };
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {FENCE.atSite(
          visit.siteLabel ?? visit.taskTitle ?? '',
          clock24(visit.checkInAt),
        ).toUpperCase()}
      </Text>
      {visit.taskTitle ? <Text variant="bodySm">{visit.taskTitle}</Text> : null}
      {visit.checkInSource !== 'manual' ? (
        <Text variant="label" tone="tertiary">
          {FENCE.auto}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button label={FENCE.openJob} size="sm" onPress={go} />
        <Button label={FENCE.addPhoto} size="sm" variant="secondary" onPress={go} />
        <Button label={FENCE.complete} size="sm" variant="secondary" onPress={go} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
