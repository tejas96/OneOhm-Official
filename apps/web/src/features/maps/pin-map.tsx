'use client';

import { APIProvider, Circle, Map as GoogleMap, Marker, useMap } from '@vis.gl/react-google-maps';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { GeoPoint } from './pin-map-value';
import { useMapsKey } from './use-maps-config';

const PINNED_ZOOM = 19;
const AREA_ZOOM = 14;

export interface PinMapProps {
  /** The pin; null shows the map at `fallbackCenter` with no pin until a click. */
  readonly value: GeoPoint | null;
  readonly onChange: (point: GeoPoint) => void;
  /** Draws a circle of this many metres around the pin (work places). */
  readonly radiusM?: number | undefined;
  readonly fallbackCenter: GeoPoint;
}

/**
 * A satellite map (with road names) and one pin: click to place it, drag to move it.
 * Renders nothing while the maps key loads or when none is set, so callers keep their inputs.
 * Uses the classic draggable `Marker`: an `AdvancedMarker` needs a Map ID, which we do not set.
 */
export function PinMap(props: PinMapProps) {
  const browserKey = useMapsKey();
  if (!browserKey) return null;
  return (
    <APIProvider apiKey={browserKey}>
      <PinMapCanvas {...props} />
    </APIProvider>
  );
}

function PinMapCanvas({ value, onChange, radiusM, fallbackCenter }: PinMapProps) {
  const t = useTranslations('maps');
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="application"
        aria-label={t('label')}
        className="h-[280px] w-full overflow-hidden rounded-lg border border-hairline"
      >
        <GoogleMap
          defaultCenter={value ?? fallbackCenter}
          defaultZoom={value ? PINNED_ZOOM : AREA_ZOOM}
          mapTypeId="hybrid"
          gestureHandling="cooperative"
          streetViewControl={false}
          mapTypeControl={false}
          clickableIcons={false}
          onClick={(event) => {
            const point = event.detail.latLng;
            if (point) onChange({ lat: point.lat, lng: point.lng });
          }}
        >
          {value && (
            <Marker
              position={value}
              draggable
              onDragEnd={(event) => {
                const point = event.latLng;
                if (point) onChange({ lat: point.lat(), lng: point.lng() });
              }}
            />
          )}
          {value && radiusM !== undefined && radiusM > 0 && (
            <Circle
              center={value}
              radius={radiusM}
              clickable={false}
              strokeColor="#ffffff"
              strokeOpacity={0.9}
              strokeWeight={2}
              fillColor="#ffffff"
              fillOpacity={0.15}
            />
          )}
          <FollowPin value={value} />
        </GoogleMap>
      </div>
      <p className="type-body-sm text-ink-faint">{t('hint')}</p>
    </div>
  );
}

/** Brings a typed (or first) pin into view; a pin already on screen is left where it is. */
function FollowPin({ value }: { readonly value: GeoPoint | null }) {
  const map = useMap();
  const lat = value?.lat;
  const lng = value?.lng;
  useEffect(() => {
    if (!map || lat === undefined || lng === undefined) return;
    if (map.getBounds()?.contains({ lat, lng })) return;
    map.panTo({ lat, lng });
    if ((map.getZoom() ?? 0) < PINNED_ZOOM - 2) map.setZoom(PINNED_ZOOM);
  }, [map, lat, lng]);
  return null;
}
