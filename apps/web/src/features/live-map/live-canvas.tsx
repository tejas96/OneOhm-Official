'use client';

import { DARK_COLORS, LIGHT_COLORS } from '@oneohm/design-system/tokens';
import { Map as GoogleMap, useMap } from '@vis.gl/react-google-maps';
import { type ReactNode, useEffect, useRef } from 'react';
import { CameraMotion } from './camera-motion';
import { type LatLng, useCamera, useUserMoved } from './map-camera';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from './map-style';
import { OverlayLayer } from './overlay-layer';
import { useDarkTheme } from './use-live';

const INDIA = { lat: 20.6, lng: 78.9 };

export type Selection = { kind: 'person' | 'site'; id: string } | null;

/**
 * A camera move asked for by the screen: `fit` a set of places (Fit all, My team, a day's
 * route), `focus` one place (an alert), or `reveal` one only if it is off screen (a pick from
 * the list). `auto` moves (the first fit) are skipped once the person has moved the map.
 */
export interface CameraCommand {
  readonly seq: number;
  readonly mode: 'fit' | 'focus' | 'reveal';
  readonly points: readonly LatLng[];
  readonly auto?: boolean;
}

export interface CanvasProps {
  /** A vector Map ID: smooth, fractional zoom. Without one the map draws raster tiles. */
  readonly mapId: string | null;
  readonly satellite: boolean;
  readonly camera: CameraCommand | null;
  /** Room the panes take over the map, so a fit keeps everything in the clear part. */
  readonly padding: google.maps.Padding;
  readonly onMapClick: () => void;
  /** The first map tiles are drawn: the loading skeleton can go. */
  readonly onReady: () => void;
  readonly shapes: ReactNode;
  readonly pins: ReactNode;
  /** Controls and native map objects (a day's route line). */
  readonly children?: ReactNode;
}

/**
 * The full-page map, as on Google Maps: wheel and pinch zoom without a modifier, double-click
 * zoom, drag to pan, the arrow and +/− keys. Google's own buttons are off; ours sit in the
 * same glass as the panes. With a Map ID it is a vector map, which zooms smoothly by any
 * amount (a raster map only in whole steps, blurring and then snapping sharp).
 */
export function LiveCanvas(props: CanvasProps) {
  const dark = useDarkTheme();
  // A vector map takes its look from the Map ID's cloud style (light and dark); the colour
  // scheme is fixed when the map is made, so a theme switch makes a new map.
  const look = props.mapId
    ? {
        mapId: props.mapId,
        renderingType: 'VECTOR' as const,
        colorScheme: dark ? ('DARK' as const) : ('LIGHT' as const),
      }
    : { styles: dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE };
  return (
    <GoogleMap
      key={props.mapId ? (dark ? 'dark' : 'light') : 'raster'}
      {...look}
      className="absolute inset-0"
      defaultCenter={INDIA}
      defaultZoom={5}
      mapTypeId={props.satellite ? 'hybrid' : 'roadmap'}
      backgroundColor={dark ? DARK_COLORS.surface : LIGHT_COLORS.canvas}
      disableDefaultUI
      clickableIcons={false}
      gestureHandling="greedy"
      keyboardShortcuts
      // A vector map's own double-click zoom jumps; ours (SmoothDoubleClick) glides.
      disableDoubleClickZoom={Boolean(props.mapId)}
      minZoom={4}
      maxZoom={20}
      onClick={props.onMapClick}
      onTilesLoaded={props.onReady}
    >
      <OverlayLayer shapes={props.shapes} pins={props.pins} />
      <CameraRunner command={props.camera} padding={props.padding} />
      {props.mapId && <SmoothDoubleClick />}
      {props.children}
    </GoogleMap>
  );
}

/** Carries out each camera command once. */
function CameraRunner({
  command,
  padding,
}: {
  readonly command: CameraCommand | null;
  readonly padding: google.maps.Padding;
}) {
  const map = useMap();
  const camera = useCamera(padding);
  const moved = useUserMoved();
  const done = useRef(0);
  useEffect(() => {
    if (!map || !command || command.seq === done.current || command.points.length === 0) return;
    done.current = command.seq;
    if (command.auto && moved.current) return;
    const [first] = command.points;
    if (command.mode === 'fit' || !first) camera.fit(command.points);
    else if (command.mode === 'focus') camera.focus(first);
    else camera.reveal(first);
  }, [map, command, camera, moved]);
  return null;
}

/** Double click zooms in a step around the clicked point, Shift + double click out. */
function SmoothDoubleClick() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('dblclick', (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      const shift = event.domEvent instanceof MouseEvent && event.domEvent.shiftKey;
      CameraMotion.of(map).zoomAt(event.latLng.toJSON(), shift ? -1 : 1);
    });
    return () => listener.remove();
  }, [map]);
  return null;
}
