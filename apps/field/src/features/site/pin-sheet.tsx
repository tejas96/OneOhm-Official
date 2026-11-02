import type { GeoPoint } from '@oneohm/domain';
import { Button, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { MapPin, X } from 'lucide-react-native';
import { useEffect, useReducer, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PIN } from '@/copy/site';
import type { PinStart } from './pin-flow';
import {
  MAP_GIVE_UP_MS,
  nextMapState,
  regionAround,
  type SheetAction,
  sheetActions,
} from './pin-sheet-state';

export interface PinSheetProps {
  /** The worker's reading; the map centres here, else on `saved`. */
  readonly start: PinStart | null;
  /** The site's saved point, shown as a second marker. */
  readonly saved: GeoPoint | null;
  readonly onConfirm: (pin: GeoPoint) => void;
  readonly onUseGps: () => void;
  readonly onClose: () => void;
}

const SPAN_M = 40;
const PIN_SIZE = 40;

/**
 * A satellite map with a pin fixed in the centre: the worker moves the map until the pin
 * sits on the roof (design 6.2). If the map has not loaded within 8 s (no signal), the
 * only action left is today's GPS reading, or keeping the saved location when there is
 * one (the GPS reading never replaces a saved point), so the work is never blocked.
 */
export function PinSheet({ start, saved, onConfirm, onUseGps, onClose }: PinSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const first = start ?? saved;
  const [state, dispatch] = useReducer(nextMapState, 'loading');
  const [centre, setCentre] = useState<GeoPoint | null>(
    first ? { latitude: first.latitude, longitude: first.longitude } : null,
  );
  useEffect(() => {
    const timer = setTimeout(
      () => dispatch({ type: 'elapsed', ms: MAP_GIVE_UP_MS }),
      MAP_GIVE_UP_MS,
    );
    return () => clearTimeout(timer);
  }, []);
  const bar = sheetActions(state, saved !== null);
  const act = (action: SheetAction) => {
    if (action === 'gps') onUseGps();
    else if (action === 'close') onClose();
    else if (centre) onConfirm(centre);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
        <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headText}>
            <Text variant="titleMd">{PIN.title}</Text>
            <Text variant="bodySm" tone="secondary">
              {PIN.hint}
            </Text>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={PIN.close}
            onPress={onClose}
            style={styles.close}
          >
            <X size={22} color={theme.colors.textPrimary} />
          </PressableScale>
        </View>
        <View style={styles.mapBox}>
          {first ? (
            <MapView
              style={StyleSheet.absoluteFill}
              provider={PROVIDER_GOOGLE}
              mapType="satellite"
              showsUserLocation
              initialRegion={regionAround(first, SPAN_M)}
              onMapLoaded={() => dispatch({ type: 'mapReady' })}
              onRegionChangeComplete={(region) =>
                setCentre({ latitude: region.latitude, longitude: region.longitude })
              }
            >
              {start?.accuracyM ? (
                <Circle
                  center={start}
                  radius={start.accuracyM}
                  strokeColor={theme.colors.accent}
                  // The accent at about 15 %, so the roof still shows through.
                  fillColor={`${theme.colors.accent}26`}
                />
              ) : null}
              {saved ? (
                <Marker coordinate={saved} title={PIN.saved} pinColor={theme.colors.accent} />
              ) : null}
            </MapView>
          ) : null}
          {/* The pin is fixed: its tip marks the map's centre, which is what is saved. */}
          <View pointerEvents="none" style={styles.pinWrap}>
            <MapPin size={PIN_SIZE} color={theme.colors.energy} fill={theme.colors.surfaceRaised} />
          </View>
          {state === 'loading' ? (
            <View
              pointerEvents="none"
              style={[styles.loading, { backgroundColor: theme.colors.surfaceRaised }]}
            >
              <Text variant="bodySm" tone="secondary">
                {PIN.loading}
              </Text>
            </View>
          ) : null}
        </View>
        <View
          style={[
            styles.bar,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderTopColor: theme.colors.borderSubtle,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          {bar.message ? (
            <Text variant="bodySm" tone="secondary">
              {bar.message}
            </Text>
          ) : null}
          <Button
            label={bar.primary.label}
            size="lg"
            fullWidth
            disabled={bar.primary.action === 'confirm' && (state !== 'ready' || !centre)}
            onPress={() => act(bar.primary.action)}
          />
          {bar.secondary ? (
            <Button
              label={bar.secondary.label}
              size="lg"
              variant="secondary"
              fullWidth
              onPress={() => act(bar.secondary?.action ?? 'close')}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headText: { flex: 1, gap: 4 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mapBox: { flex: 1, overflow: 'hidden' },
  pinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -PIN_SIZE / 2,
    // The icon's tip is at its bottom edge, so lift it by its full height.
    marginTop: -PIN_SIZE,
  },
  loading: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  bar: { gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
