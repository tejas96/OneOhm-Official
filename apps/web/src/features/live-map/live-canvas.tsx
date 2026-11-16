'use client';

import { DARK_COLORS, LIGHT_COLORS } from '@oneohm/design-system/tokens';
import { Map as GoogleMap, useMap } from '@vis.gl/react-google-maps';
import { type ReactNode, useEffect, useRef } from 'react';
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
 * same glass as the panes.
 */
export function LiveCanvas(props: CanvasProps) {
  const dark = useDarkTheme();
  return (
    <GoogleMap
      className="absolute inset-0"
      defaultCenter={INDIA}
      defaultZoom={5}
      mapTypeId={props.satellite ? 'hybrid' : 'roadmap'}
      styles={dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
      backgroundColor={dark ? DARK_COLORS.surface : LIGHT_COLORS.canvas}
      disableDefaultUI
      clickableIcons={false}
      gestureHandling="greedy"
      keyboardShortcuts
      disableDoubleClickZoom={false}
      minZoom={4}
      maxZoom={20}
      onClick={props.onMapClick}
      onTilesLoaded={props.onReady}
    >
      <OverlayLayer shapes={props.shapes} pins={props.pins} />
      <CameraRunner command={props.camera} padding={props.padding} />
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
    else if (!map.getBounds()?.contains(first)) map.panTo(first);
  }, [map, command, camera, moved]);
  return null;
}
