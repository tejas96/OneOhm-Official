'use client';

import type { DutyDay } from '@oneohm/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { advance, replaySpan, type Speed, toReplayPoints } from './replay';

/** A person's duty day: stops, travel, visits, gaps, totals and the points for the replay. */
export function useDutyDay(personId: string | null, date: string) {
  return useQuery({
    queryKey: ['duty-day', personId, date],
    queryFn: () =>
      expectStatus(
        api.dutyPoints.personDay({ params: { id: personId ?? '' }, query: { date } }),
        200,
      ),
    enabled: personId !== null,
    // Today's day grows while it is open.
    refetchInterval: 60_000,
  });
}

export interface Replay {
  readonly span: { start: number; end: number } | null;
  readonly points: ReturnType<typeof toReplayPoints>;
  /** The replay's time (epoch ms of the day). */
  readonly t: number;
  readonly playing: boolean;
  readonly speed: Speed;
  readonly play: () => void;
  readonly pause: () => void;
  readonly seek: (t: number) => void;
  readonly setSpeed: (speed: Speed) => void;
}

/** Plays a day: the time moves with the frames while playing, and stops at the end. */
export function useReplay(day: DutyDay | undefined): Replay {
  const [now] = useState(() => Date.now());
  const span = useMemo(() => (day ? replaySpan(day, now) : null), [day, now]);
  const points = useMemo(() => toReplayPoints(day?.points ?? []), [day]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(4);
  const timeRef = useRef(0);
  const key = day ? `${day.userId}:${day.date}` : '';
  // A new day starts at its beginning, paused.
  useEffect(() => {
    if (!span || !key) return;
    timeRef.current = span.start;
    setT(span.start);
    setPlaying(false);
  }, [key, span?.start, span]);
  useEffect(() => {
    if (!playing || !span) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(at) {
      const next = advance(timeRef.current, at - last, speed, span.end);
      last = at;
      timeRef.current = next;
      setT(next);
      if (next >= span.end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, span]);
  const seek = useCallback((next: number) => {
    timeRef.current = next;
    setT(next);
  }, []);
  const play = useCallback(() => {
    if (span && timeRef.current >= span.end) seek(span.start);
    setPlaying(true);
  }, [span, seek]);
  const pause = useCallback(() => setPlaying(false), []);
  return { span, points, t, playing, speed, play, pause, seek, setSpeed };
}
