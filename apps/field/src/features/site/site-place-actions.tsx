import type { TaskSite } from '@oneohm/api-contracts';
import { Button, Text, useTheme } from '@oneohm/mobile-ui';
import { MapPinned, Navigation } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { SITE } from '@/copy/site';
import { buttonState } from './button-state';
import { directionsUrl } from './directions';
import { pinLabel } from './pin-flow';
import { PinSheet } from './pin-sheet';
import { mapsEnabled, type usePinRoof } from './use-pin-roof';

/**
 * Pin the roof on the map (when the map can show here and the person is checked in)
 * and Navigate to the site: to its point when saved, else to its address text.
 */
export function SitePlaceActions({
  site,
  pin,
}: {
  readonly site: TaskSite;
  readonly pin: ReturnType<typeof usePinRoof>;
}) {
  const theme = useTheme();
  const canPin = mapsEnabled && site.canPinSite;
  const navigateTo = directionsUrl(site.sitePoint, site.siteAddress);
  return (
    <>
      {canPin || navigateTo ? (
        <View style={styles.row}>
          {canPin ? (
            <Button
              {...buttonState(pin.isPending, pin.label, pinLabel(site.sitePoint))}
              variant="secondary"
              icon={<MapPinned size={16} color={theme.colors.textPrimary} />}
              onPress={() => void pin.begin()}
              fullWidth
            />
          ) : null}
          {navigateTo ? (
            <Button
              label={SITE.navigate}
              variant="secondary"
              icon={<Navigation size={16} color={theme.colors.textPrimary} />}
              onPress={() => void Linking.openURL(navigateTo)}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}
      {pin.waiting ? (
        <Text variant="bodySm" tone="secondary">
          {SITE.pinWaiting}
        </Text>
      ) : null}
      {pin.sheet ? (
        <PinSheet
          start={pin.sheet.start}
          saved={site.sitePoint}
          canSetSite={pin.sheet.canSetSite}
          onConfirm={pin.confirm}
          onUseGps={pin.saveGps}
          onClose={pin.close}
        />
      ) : null}
    </>
  );
}

// Stacked, full width: "Move the roof pin" does not fit half a phone's width.
const styles = StyleSheet.create({ row: { gap: 8 } });
