import { AppleMaps } from 'expo-maps';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { centreOf, PIN_SPAN_M, type PinMapViewProps } from './pin-map-view.types';
import { zoomAround } from './pin-sheet-state';

/**
 * Apple Maps (expo-maps, iOS 17+), hybrid so road names show on the satellite picture.
 * No key is needed. Apple Maps has no "map loaded" event, so the first `onCameraMove`
 * (sent when the map first settles on its camera, then after every move) means ready.
 */
export function PinMapView({
  first,
  start,
  saved,
  savedTitle,
  accent,
  onReady,
  onCentre,
}: PinMapViewProps) {
  // Set once: a new camera position would snap the map back while the worker moves it.
  const [camera] = useState(() => ({
    coordinates: { latitude: first.latitude, longitude: first.longitude },
    zoom: zoomAround(first, PIN_SPAN_M),
  }));
  return (
    <AppleMaps.View
      style={StyleSheet.absoluteFill}
      cameraPosition={camera}
      properties={{ mapType: AppleMaps.MapType.HYBRID, isMyLocationEnabled: true }}
      uiSettings={{ myLocationButtonEnabled: false, togglePitchEnabled: false }}
      circles={
        start?.accuracyM
          ? [
              {
                id: 'accuracy',
                center: { latitude: start.latitude, longitude: start.longitude },
                radius: start.accuracyM,
                lineColor: accent,
                lineWidth: 2,
                // The accent at about 15 %, so the roof still shows through.
                color: `${accent}26`,
              },
            ]
          : []
      }
      markers={
        saved ? [{ id: 'saved', coordinates: saved, title: savedTitle, tintColor: accent }] : []
      }
      onCameraMove={(event) => {
        onReady();
        const centre = centreOf(event.coordinates);
        if (centre) onCentre(centre);
      }}
    />
  );
}
