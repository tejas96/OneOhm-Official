import { Button, Card, Text } from '@oneohm/mobile-ui';
import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { DUTY } from '@/copy/duty';
import { needsBatteryHint } from './duty-state';
import { readPrefs, writePrefs } from './duty-store';

/**
 * Shown once on phones whose battery saver tends to close background apps (Xiaomi, Oppo,
 * Vivo, Realme, OnePlus): where to switch it off for OneOhm. The button opens the app's
 * settings; there is no deeper link that works on every maker.
 */
export function BatteryHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!needsBatteryHint(Platform.OS, Device.manufacturer)) return;
    void readPrefs().then((prefs) => setShow(!prefs.batteryHintSeen));
  }, []);
  if (!show) return null;
  const done = () => {
    setShow(false);
    void writePrefs({ batteryHintSeen: true });
  };
  return (
    <Card tone="sunken" style={styles.card}>
      <Text variant="titleMd">{DUTY.batteryTitle}</Text>
      <Text variant="bodySm" tone="secondary">
        {DUTY.batteryBody}
      </Text>
      <View style={styles.actions}>
        <Button label={DUTY.batteryOpen} size="sm" onPress={() => void Linking.openSettings()} />
        <Button label={DUTY.batteryDone} size="sm" variant="quiet" onPress={done} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
