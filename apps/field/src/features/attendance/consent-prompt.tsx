import { Button, Card, describeError, Text, useTheme } from '@oneohm/mobile-ui';
import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { ATTENDANCE } from '@/copy/workforce';
import { useConsent } from './use-workday';

/** Asked once, in plain words, before any location is shared (PRD 4.3, privacy). */
export function ConsentPrompt({ days }: { readonly days: number }) {
  const theme = useTheme();
  const consent = useConsent();
  const toast = useToast();
  // Which answer is being sent: only that button spins, both wait.
  const [answer, setAnswer] = useState<boolean | null>(null);
  const reply = (given: boolean) => {
    if (consent.isPending) return;
    setAnswer(given);
    consent.mutate(given, {
      onError: (error) => toast(describeError(error)),
      onSettled: () => setAnswer(null),
    });
  };
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
          pending={consent.isPending && answer === true}
          disabled={consent.isPending}
          onPress={() => reply(true)}
        />
        <Button
          label={ATTENDANCE.notNow}
          size="sm"
          variant="quiet"
          pending={consent.isPending && answer === false}
          disabled={consent.isPending}
          onPress={() => reply(false)}
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
