'use client';

import { DARK_COLORS, LIGHT_COLORS } from '@oneohm/design-system/tokens';
import { APIProvider, Map as GoogleMap, Marker, Polyline, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useRef } from 'react';
import { useDarkTheme } from '@/features/live-map/use-live';

type Place = { readonly latitude: number; readonly longitude: number };

const at = (place: Place) => ({ lat: place.latitude, lng: place.longitude });

/** The worker: a round blue pin with their initial (the Duty Day "moving" colour). */
const workerPin = (color: string): google.maps.Symbol => ({
  path: 0, // google.maps.SymbolPath.CIRCLE, before the library has loaded
  scale: 15,
  fillColor: color,
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 3,
});

/** The home: a small green house, its floor on the spot. */
const homePin = (color: string): google.maps.Symbol => ({
  path: 'M -11,-9 L 0,-19 L 11,-9 L 11,2 L -11,2 Z',
  fillColor: color,
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 2.5,
  scale: 1,
});

/**
 * The small live map of the "Track live" page: the worker's pin, the home's pin and a dotted
 * straight line between them. It fits both once; after that the person's own pan and zoom stay.
 */
export function TrackMap(props: {
  readonly browserKey: string;
  readonly mapId: string | null;
  readonly worker: Place | null;
  readonly home: Place | null;
  readonly label: string;
  readonly homeLabel: string;
  readonly workerName: string;
  /** The worker's initial, on their pin. */
  readonly initial: string;
}) {
  const dark = useDarkTheme();
  const colors = dark ? DARK_COLORS : LIGHT_COLORS;
  const center = props.worker ?? props.home;
  if (!center) return null;
  const look = props.mapId
    ? { mapId: props.mapId, colorScheme: dark ? ('DARK' as const) : ('LIGHT' as const) }
    : {};
  return (
    <APIProvider apiKey={props.browserKey}>
      <div role="application" aria-label={props.label} className="absolute inset-0">
        <GoogleMap
          key={dark ? 'dark' : 'light'}
          {...look}
          className="absolute inset-0"
          defaultCenter={at(center)}
          defaultZoom={14}
          backgroundColor={colors.canvas}
          disableDefaultUI
          clickableIcons={false}
          gestureHandling="greedy"
        >
          {props.home && (
            <Marker
              position={at(props.home)}
              title={props.homeLabel}
              icon={homePin(colors.energy)}
            />
          )}
          {props.worker && (
            <Marker
              position={at(props.worker)}
              icon={workerPin(colors.accent)}
              label={{ text: props.initial, color: '#ffffff', fontSize: '14px', fontWeight: '600' }}
              title={props.workerName}
              zIndex={2}
            />
          )}
          {props.worker && props.home && (
            <Polyline
              path={[at(props.worker), at(props.home)]}
              strokeOpacity={0}
              icons={[
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.7,
                    strokeColor: colors.accent,
                    scale: 3,
                  },
                  offset: '0',
                  repeat: '14px',
                },
              ]}
            />
          )}
          <FitOnce worker={props.worker} home={props.home} />
        </GoogleMap>
      </div>
    </APIProvider>
  );
}

/** Fits the worker and the home on the first position; later refreshes leave the view alone. */
function FitOnce({ worker, home }: { readonly worker: Place | null; readonly home: Place | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!map || done.current || !worker) return;
    done.current = true;
    if (!home) {
      map.panTo(at(worker));
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(at(worker));
    bounds.extend(at(home));
    map.fitBounds(bounds, { top: 56, bottom: 72, left: 40, right: 40 });
  }, [map, worker, home]);
  return null;
}
