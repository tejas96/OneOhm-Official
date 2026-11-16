'use client';

import type { DutyAlert, LivePerson, LiveSites } from '@oneohm/api-contracts';
import { todayIn } from '@oneohm/shared';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { alertSiteId, alertTarget, DAY_KINDS, newestOfKind } from './alerts/alert-format';
import type { CameraCommand, Selection } from './live-canvas';
import { isOnDuty, type LiveFilter, matchesFilter } from './live-format';
import type { LatLng } from './map-camera';

export type PanelTab = 'people' | 'alerts';
export interface DayOpen {
  readonly personId: string;
  readonly date: string;
}

const isDate = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Keeps the open day in the address, so it can be shared and survives a reload. */
function writeDayToUrl(day: DayOpen | null) {
  const url = new URL(window.location.href);
  for (const key of ['day', 'date', 'alert', 'kind', 'tab', 'site']) url.searchParams.delete(key);
  if (day) {
    url.searchParams.set('day', day.personId);
    url.searchParams.set('date', day.date);
  }
  window.history.replaceState(window.history.state, '', url);
}

/**
 * The alert a link points at: by its id, else the newest open one of its kind (for its site,
 * when the link names one). A push notice does not know the alert's id.
 */
function linkedAlert(
  alerts: readonly DutyAlert[],
  link: { id: string | null; kind: string | null; site: string | null },
): DutyAlert | null {
  const byId = link.id ? alerts.find((row) => row.id === link.id) : undefined;
  if (byId) return byId;
  if (!link.kind) return null;
  const forSite = link.site ? alerts.filter((row) => alertSiteId(row) === link.site) : alerts;
  return newestOfKind(forSite, link.kind);
}

/** What the live map screen is showing and where its camera goes; links open it on a thing. */
export function useLiveView(input: {
  readonly people: readonly LivePerson[];
  readonly sites: LiveSites['sites'];
  readonly offices: LiveSites['offices'];
  readonly alerts: readonly DutyAlert[] | undefined;
  readonly loaded: boolean;
}) {
  const { people, sites, offices, alerts, loaded } = input;
  const params = useSearchParams();
  const today = todayIn();
  const [filter, setFilter] = useState<LiveFilter>('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<PanelTab>(
    params.get('tab') === 'alerts' || params.get('kind') ? 'alerts' : 'people',
  );
  const [focusedAlert, setFocusedAlert] = useState<string | null>(params.get('alert'));
  const [nearestFor, setNearestFor] = useState<string | null>(null);
  const linkedDay = params.get('day');
  const [day, setDayState] = useState<DayOpen | null>(
    linkedDay
      ? {
          personId: linkedDay,
          date: isDate(params.get('date')) ? (params.get('date') ?? today) : today,
        }
      : null,
  );
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const seq = useRef(0);
  const move = useCallback(
    (mode: CameraCommand['mode'], points: readonly LatLng[], auto = false) => {
      if (points.length === 0) return;
      seq.current += 1;
      setCamera({ seq: seq.current, mode, points, auto });
    },
    [],
  );

  const positionOf = (id: string): LatLng | null => {
    const at = people.find((row) => row.person.id === id)?.position;
    return at ? { lat: at.latitude, lng: at.longitude } : null;
  };
  const allPoints = (): LatLng[] => {
    const points: LatLng[] = [
      ...people.flatMap((row) =>
        row.position && matchesFilter(row.state, filter)
          ? [{ lat: row.position.latitude, lng: row.position.longitude }]
          : [],
      ),
      ...sites.map((site) => ({ lat: site.latitude, lng: site.longitude })),
    ];
    return points.length > 0
      ? points
      : offices.map((office) => ({ lat: office.latitude, lng: office.longitude }));
  };
  const teamPoints = (): LatLng[] =>
    people.flatMap((row) =>
      row.position && isOnDuty(row.state)
        ? [{ lat: row.position.latitude, lng: row.position.longitude }]
        : [],
    );

  const setDay = useCallback((next: DayOpen | null) => {
    setDayState(next);
    writeDayToUrl(next);
  }, []);
  const focusAlert = (alert: DutyAlert) => {
    setFocusedAlert(alert.id);
    const target = alertTarget(alert, people, sites);
    setSelection({ kind: target.kind, id: target.id });
    if (target.at) move('focus', [target.at]);
  };
  const openDayOf = (personId: string, date = today) => setDay({ personId, date });
  /** Picks a pin or a list row: its card opens on the People tab. */
  const pick = (next: Selection) => {
    setSelection(next);
    setNearestFor(null);
    if (next) setTab('people');
  };
  /** Brings a pick from the list into view if it is off screen. */
  const reveal = (next: Selection) => {
    if (!next) return;
    const site = next.kind === 'site' ? sites.find((row) => row.id === next.id) : null;
    const at = site ? { lat: site.latitude, lng: site.longitude } : positionOf(next.id);
    if (at) move('reveal', [at]);
  };
  const sendNearest = (alert: DutyAlert) => {
    const siteId = alertSiteId(alert);
    if (!siteId) return;
    setFocusedAlert(alert.id);
    setSelection({ kind: 'site', id: siteId });
    setNearestFor(siteId);
    setTab('people');
    const site = sites.find((row) => row.id === siteId);
    if (site) move('focus', [{ lat: site.latitude, lng: site.longitude }]);
  };

  // The first fit, once the data is here (skipped if the person already moved the map), and
  // links: a notice opens the newest alert of its kind; a day kind opens that person's day.
  const started = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, when the data first arrives.
  useEffect(() => {
    if (!loaded || started.current) return;
    const kind = params.get('kind');
    if (kind && !alerts) return;
    started.current = true;
    const linkedSite = params.get('site');
    const alert = linkedAlert(alerts ?? [], { id: focusedAlert, kind, site: linkedSite });
    if (alert && !day) {
      if (DAY_KINDS.has(alert.kind)) setDay({ personId: alert.person.id, date: alert.day });
      else focusAlert(alert);
      return;
    }
    if (linkedSite) {
      const site = sites.find((row) => row.id === linkedSite);
      setSelection({ kind: 'site', id: linkedSite });
      if (site) move('focus', [{ lat: site.latitude, lng: site.longitude }]);
      return;
    }
    if (!day) move('fit', allPoints(), true);
  }, [loaded, alerts]);

  return {
    today,
    filter,
    setFilter,
    selection,
    setSelection,
    tab,
    setTab,
    focusedAlert,
    setFocusedAlert,
    nearestFor,
    setNearestFor,
    day,
    setDay,
    camera,
    move,
    positionOf,
    fitAll: () => move('fit', allPoints()),
    myTeam: () => move('fit', teamPoints()),
    focusAlert,
    openDayOf,
    pick,
    reveal,
    sendNearest,
  };
}

export type LiveView = ReturnType<typeof useLiveView>;
