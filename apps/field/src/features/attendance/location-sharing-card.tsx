import { Button, Card, describeError, Text } from '@oneohm/mobile-ui';
import { StyleSheet } from 'react-native';
import { useToast } from '@/components/toast';
import { ATTENDANCE } from '@/copy/workforce';
import { useConsent, useWorkday } from './use-workday';

/** Where the person turns location sharing at check-in on or off again (PRD 4.3). */
export function LocationSharingCard() {
  const workday = useWorkday();
  const consent = useConsent();
  const toast = useToast();
  const data = workday.data;
  if (!data?.attendance.captureLocation) return null;
  const sharing = data.consent.given;
  return (
    <Card style={styles.card}>
      <Text variant="label" tone="tertiary">
        {ATTENDANCE.locationTitle}
      </Text>
      <Text variant="body">{sharing ? ATTENDANCE.sharing : ATTENDANCE.notSharing}</Text>
      <Text variant="bodySm" tone="secondary">
        {ATTENDANCE.consentBody(data.attendance.retentionDays)}
      </Text>
      <Button
        label={sharing ? ATTENDANCE.stopSharing : ATTENDANCE.allow}
        variant="secondary"
        size="sm"
        pending={consent.isPending}
        onPress={() => {
          if (consent.isPending) return;
          consent.mutate(!sharing, { onError: (error) => toast(describeError(error)) });
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: 8 } });
