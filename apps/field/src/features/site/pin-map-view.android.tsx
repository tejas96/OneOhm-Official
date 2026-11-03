import { GoogleMaps } from 'expo-maps';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { centreOf, PIN_SPAN_M, type PinMapViewProps } from './pin-map-view.types';
import { zoomAround } from './pin-sheet-state';

/** Google Maps draws the world 256 dp wide at zoom 0. */
const TILE_DP = 256;

/**
 * Google Maps (expo-maps), hybrid so road names show on the satellite picture. The key is
 * read from the manifest (`com.google.android.geo.API_KEY`, from
 * `android.config.googleMaps.apiKey`). Ready on `onMapLoaded`; `onCameraMove` fires once
 * on mount and after every move, with the camera's centre.
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
  const { width } = useWindowDimensions();
  // Set once: a new camera position would snap the map back while the worker moves it.
  const [camera] = useState(() => ({
    coordinates: { latitude: first.latitude, longitude: first.longitude },
    zoom: zoomAround(first, PIN_SPAN_M, width / TILE_DP),
  }));
  return (
    <GoogleMaps.View
      style={StyleSheet.absoluteFill}
      cameraPosition={camera}
      properties={{ mapType: GoogleMaps.MapType.HYBRID, isMyLocationEnabled: true }}
      uiSettings={{
        mapToolbarEnabled: false,
        myLocationButtonEnabled: false,
        tiltGesturesEnabled: false,
        zoomControlsEnabled: false,
      }}
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
      markers={saved ? [{ id: 'saved', coordinates: saved, title: savedTitle }] : []}
      onMapLoaded={onReady}
      onCameraMove={(event) => {
        const centre = centreOf(event.coordinates);
        if (centre) onCentre(centre);
      }}
    />
  );
}
