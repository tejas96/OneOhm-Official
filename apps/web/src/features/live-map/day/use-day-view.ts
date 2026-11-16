'use client';

import type { DutyDay, DutyDaySegment } from '@oneohm/api-contracts';
import { useCallback, useMemo, useState } from 'react';
import type { LatLng } from '../map-camera';
import { positionAt, type ReplayPoint, segmentIndexAt } from './replay';
import { useDutyDay, useReplay } from './use-replay';

/** The places of a segment, for the map to fit when it is picked. */
export function segmentPlaces(segment: DutyDaySegment, points: readonly ReplayPoint[]): LatLng[] {
  if (segment.kind === 'stop')
    return [{ lat: segment.centre.latitude, lng: segment.centre.longitude }];
  const from = new Date(segment.startAt).getTime();
  const to = new Date(segment.endAt).getTime();
  const inside = points.filter((point) => point.t >= from && point.t <= to);
  if (inside.length > 0) return inside.map(({ lat, lng }) => ({ lat, lng }));
  const at = positionAt(points, from);
  return at ? [at] : [];
}

/** Every place of the day, for the first fit: the route, else its stops. */
export function dayPlaces(day: DutyDay | undefined): LatLng[] {
  if (!day) return [];
  if (day.points.length > 0)
    return day.points.map((point) => ({ lat: point.latitude, lng: point.longitude }));
  return day.segments.flatMap((segment) =>
    segment.kind === 'stop'
      ? [{ lat: segment.centre.latitude, lng: segment.centre.longitude }]
      : [],
  );
}

/**
 * Everything a day view needs: the day, its replay, the segment the replay is in, the one the
 * manager picked (highlighted on the map), and where the marker is now.
 */
export function useDayView(personId: string | null, date: string) {
  const query = useDutyDay(personId, date);
  const replay = useReplay(query.data);
  // A pick belongs to one person's day; another day starts with none.
  const key = `${personId}:${date}`;
  const [pickedAt, setPicked] = useState<{ key: string; index: number } | null>(null);
  const picked = pickedAt?.key === key ? pickedAt.index : null;
  const segments = query.data?.segments ?? [];
  const active = segmentIndexAt(segments, replay.t);
  const at = useMemo(() => positionAt(replay.points, replay.t), [replay.points, replay.t]);
  const { pause, seek } = replay;
  const pick = useCallback(
    (index: number) => {
      const segment = query.data?.segments[index];
      if (!segment) return;
      setPicked({ key, index });
      pause();
      seek(new Date(segment.startAt).getTime());
    },
    [query.data, pause, seek, key],
  );
  const highlight = picked === null ? null : (segments[picked] ?? null);
  return { query, replay, segments, active, picked, pick, highlight, at };
}

export type DayView = ReturnType<typeof useDayView>;
