import { Button, Card, Text, useTheme } from '@oneohm/mobile-ui';
import { MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { ATTENDANCE } from '@/copy/workforce';
import { useConsent } from './use-workday';

/** Asked once, in plain words, before any location is shared (PRD 4.3, privacy). */
export function ConsentPrompt({ days }: { readonly days: number }) {
  const theme = useTheme();
  const consent = useConsent();
  return (
    <Card tone="sunken" style={styles.card}>
      <View style={styles.title}>
        <MapPin size={16} color={theme.colors.accent} />
        <Text variant="titleMd">{ATTENDANCE.consentTitle}</Text>
      </View>
      <Text variant="bodySm" tone="secondary">
        {ATTENDANCE.consentBody(days)}
      </Text>
      <View style={styles.actions}>
        <Button
          label={ATTENDANCE.allow}
          size="sm"
          pending={consent.isPending}
          onPress={() => consent.mutate(true)}
        />
        <Button
          label={ATTENDANCE.notNow}
          size="sm"
          variant="quiet"
          onPress={() => consent.mutate(false)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
