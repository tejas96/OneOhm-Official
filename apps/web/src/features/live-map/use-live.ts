'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useThemePreference } from '@/providers/app-providers';

/** Positions refresh every 30 s while the page is open and visible (React Query stops when hidden). */
export const LIVE_REFRESH_MS = 30_000;

export const LIVE_TEAM_KEY = ['live', 'team'] as const;
export const LIVE_SITES_KEY = ['live', 'sites'] as const;

export function useLiveTeam() {
  return useQuery({
    queryKey: LIVE_TEAM_KEY,
    queryFn: () => expectStatus(api.liveMap.liveTeam(), 200),
    refetchInterval: LIVE_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useLiveSites() {
  return useQuery({
    queryKey: LIVE_SITES_KEY,
    queryFn: () => expectStatus(api.liveMap.liveSites(), 200),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

/** The clock for "Updated 10 s ago" and "last seen", ticking every `everyMs`. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Whether the app is dark right now: the saved choice, else the device setting. */
export function useDarkTheme(): boolean {
  const { theme } = useThemePreference();
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(query.matches);
    const listen = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', listen);
    return () => query.removeEventListener('change', listen);
  }, []);
  return theme === 'dark' || (theme === 'system' && systemDark);
}

/** Phones get the bottom sheet; the side panel needs the sidebar's breakpoint (900 px). */
export function useWideScreen(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    setWide(query.matches);
    const listen = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener('change', listen);
    return () => query.removeEventListener('change', listen);
  }, []);
  return wide;
}
