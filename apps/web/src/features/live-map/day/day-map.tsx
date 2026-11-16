'use client';

import type { DutyDay, DutyDaySegment } from '@oneohm/api-contracts';
import { DARK_COLORS, DUTY_SWATCHES, LIGHT_COLORS } from '@oneohm/design-system/tokens';
import { useMap } from '@vis.gl/react-google-maps';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { usePinLayout } from '../overlay-layer';
import { useDarkTheme } from '../use-live';
import type { ReplayPoint } from './replay';
import './day-map.css';

/** Points further apart than this are a gap: the line between them is dashed. */
const GAP_MS = 10 * 60_000;

/** Runs of the route with no gap inside, and the dashed jumps between them. */
export function splitRoute(points: readonly ReplayPoint[]) {
  const runs: google.maps.LatLngLiteral[][] = [];
  const jumps: [google.maps.LatLngLiteral, google.maps.LatLngLiteral][] = [];
  let run: google.maps.LatLngLiteral[] = [];
  points.forEach((point, index) => {
    const before = points[index - 1];
    const at = { lat: point.lat, lng: point.lng };
    if (before && point.t - before.t > GAP_MS) {
      runs.push(run);
      jumps.push([{ lat: before.lat, lng: before.lng }, at]);
      run = [];
    }
    run.push(at);
  });
  runs.push(run);
  return { runs: runs.filter((one) => one.length > 1), jumps };
}

/** The points of one segment (for the highlight), by time. */
const pointsIn = (points: readonly ReplayPoint[], segment: DutyDaySegment) => {
  const from = new Date(segment.startAt).getTime();
  const to = new Date(segment.endAt).getTime();
  return points
    .filter((point) => point.t >= from && point.t <= to)
    .map(({ lat, lng }) => ({ lat, lng }));
};

/**
 * The day on the map, drawn by Google itself so it is exact at every zoom: the route as a
 * line (dashed across gaps), the picked segment in a thicker line on top, and pins for the
 * stops and the replay's marker (placed by the pin layout like the live pins).
 */
export function DayRoute({
  points,
  highlight,
}: {
  readonly points: readonly ReplayPoint[];
  readonly highlight: DutyDaySegment | null;
}) {
  const map = useMap();
  const dark = useDarkTheme();
  const tone = DUTY_SWATCHES[dark ? 'dark' : 'light'];
  const route = useMemo(() => splitRoute(points), [points]);
  useEffect(() => {
    if (!map) return;
    const halo = dark ? DARK_COLORS.surface : LIGHT_COLORS.surfaceRaised;
    const lines = [
      ...route.runs.flatMap((path) => [
        new google.maps.Polyline({
          map,
          path,
          strokeColor: halo,
          strokeWeight: 8,
          strokeOpacity: 0.9,
          zIndex: 1,
          clickable: false,
        }),
        new google.maps.Polyline({
          map,
          path,
          strokeColor: tone.moving,
          strokeWeight: 4.5,
          strokeOpacity: 0.95,
          zIndex: 2,
          clickable: false,
        }),
      ]),
      ...route.jumps.map(
        (path) =>
          new google.maps.Polyline({
            map,
            path,
            strokeOpacity: 0,
            zIndex: 2,
            clickable: false,
            icons: [
              {
                icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: tone.gap, scale: 3 },
                offset: '0',
                repeat: '12px',
              },
            ],
          }),
      ),
    ];
    return () => {
      for (const line of lines) line.setMap(null);
    };
  }, [map, route, tone.moving, tone.gap, dark]);
  useEffect(() => {
    if (!map || !highlight || highlight.kind !== 'travel') return;
    const path = pointsIn(points, highlight);
    if (path.length < 2) return;
    const line = new google.maps.Polyline({
      map,
      path,
      strokeColor: tone.visit,
      strokeWeight: 8,
      strokeOpacity: 1,
      zIndex: 3,
      clickable: false,
    });
    return () => line.setMap(null);
  }, [map, highlight, points, tone.visit]);
  return null;
}

/** Stops on the day's route (unknown ones in amber), and the replay marker on top. */
export function DayPins({
  day,
  at,
  initials,
  swatch,
  highlight,
}: {
  readonly day: DutyDay;
  readonly at: { lat: number; lng: number } | null;
  readonly initials: string;
  readonly swatch: number;
  readonly highlight: DutyDaySegment | null;
}) {
  const layout = usePinLayout();
  const stops = day.segments.flatMap((segment, index) =>
    segment.kind === 'stop' ? [{ segment, key: `stop-${index}` }] : [],
  );
  useLayoutEffect(() => {
    for (const { segment, key } of stops)
      layout.place(key, 'site', { lat: segment.centre.latitude, lng: segment.centre.longitude });
    layout.place('replay', 'marker', at, { instant: true });
    layout.commit();
  });
  return (
    <>
      {stops.map(({ segment, key }) => (
        <span
          key={key}
          ref={layout.ref(key, 'site')}
          aria-hidden
          className="live-pin live-stop"
          data-place={segment.place}
          data-flagged={segment.flagged || undefined}
          data-selected={highlight === segment || undefined}
          style={{ zIndex: highlight === segment ? 25 : 6 }}
        >
          <span className="live-stop-dot" />
        </span>
      ))}
      <span
        ref={layout.ref('replay', 'marker')}
        aria-hidden
        className="live-pin live-worker live-replay"
        data-state="moving"
        style={{ zIndex: 40, '--tone': 'var(--oh-duty-moving)' } as React.CSSProperties}
      >
        <span className="live-worker-body">
          <span className="live-worker-halo" />
          <span className={`live-worker-disc bg-swatch-${swatch % 6}`}>{initials}</span>
        </span>
      </span>
    </>
  );
}
