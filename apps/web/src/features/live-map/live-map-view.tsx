'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import { useState } from 'react';
import { useMapsConfig } from '@/features/maps/use-maps-config';
import { alertCounts } from './alerts/alert-format';
import { useLiveAlerts } from './alerts/use-alerts';
import { BottomSheet, type SheetStop } from './bottom-sheet';
import { useLiveDay } from './day/use-live-day';
import { HudBar } from './hud-bar';
import { LiveCanvas, type Selection } from './live-canvas';
import { liveCounts } from './live-format';
import { type LivePanelProps, PanelBody, PanelHeader } from './live-panel';
import { LivePins } from './live-pins';
import { MapControls } from './map-controls';
import { MapLoading, MapNotice, noticeFor } from './map-notice';
import { MapShapes } from './map-shapes';
import { useLiveSites, useLiveTeam, useWideScreen } from './use-live';
import { useLiveView } from './use-live-view';
import './live-map.css';
import './live-pins.css';

/**
 * Room the panes and the map buttons take over the map, for fits: on the right the panel
 * (372 px), the button column (60 px) and a fanned-out group of pins (64 px), so no pin
 * lands under a button.
 */
const WIDE_PADDING = { top: 104, right: 496, bottom: 64, left: 72 };
const WIDE_DAY_PADDING = { top: 48, right: 496, bottom: 120, left: 72 };
const PHONE_PADDING = { top: 132, right: 100, bottom: 200, left: 28 };

/**
 * The manager's live map (Duty Day steps 4 and 5): the whole screen is the map; the numbers
 * float on top; the people, the alerts, a picked card or a person's day sit in a panel (a sheet
 * on phones). Refreshes every 30 s.
 */
export function LiveMapView() {
  const { browserKey, mapId } = useMapsConfig();
  const { team, people, sites, offices, alertList, loaded, alertsLoaded } = useLiveData();
  const wide = useWideScreen();
  const view = useLiveView({
    people,
    sites,
    offices,
    alerts: alertsLoaded ? alertList : undefined,
    loaded,
  });
  const [satellite, setSatellite] = useState(false);
  const [stop, setStop] = useState<SheetStop>('peek');
  const [mapReady, setMapReady] = useState(false);
  const counts = liveCounts(people);
  const alerts = alertCounts(alertList);
  const { dayPins, dayRoute, replayBar, dayPanel, fitDay } = useLiveDay({
    view,
    people,
    alerts: alertList,
    onPicked: () => !wide && setStop('peek'),
  });
  const select = (next: Selection, reveal = false) => {
    view.pick(next);
    if (!wide && next) setStop('half');
    if (reveal) view.reveal(next);
  };
  const panel = {
    view,
    people,
    sites,
    onDuty: counts.on_duty,
    alerts,
    updatedAt: team.dataUpdatedAt,
    failed: team.isError,
    onSelect: (next: Selection) => select(next, true),
    dayPanel,
  };
  // A day view has its own empty state in the panel.
  const notice = noticeFor({
    failed: team.isError,
    loaded: Boolean(team.data),
    picked: view.selection !== null || view.day !== null,
    people: people.length,
    onDuty: counts.on_duty,
  });
  const padding = paddingFor(wide, Boolean(view.day));
  return (
    <div className="relative -mx-4 -my-6 h-[calc(100dvh-3.5rem)] overflow-hidden bg-sunken sm:-mx-6 md:-mx-10 md:-my-9 md:h-dvh">
      {browserKey ? (
        <APIProvider apiKey={browserKey}>
          <LiveCanvas
            mapId={mapId}
            satellite={satellite}
            camera={view.camera}
            padding={padding}
            onMapClick={() => select(null)}
            onReady={() => setMapReady(true)}
            shapes={view.day ? null : <MapShapes people={people} offices={offices} />}
            pins={
              view.day ? (
                dayPins
              ) : (
                <LivePins
                  people={people}
                  sites={sites}
                  filter={view.filter}
                  selection={view.selection}
                  onSelect={(next) => select(next)}
                />
              )
            }
          >
            {dayRoute}
            <MapControls
              satellite={satellite}
              onSatellite={setSatellite}
              onFitAll={view.day ? fitDay : view.fitAll}
              onMyTeam={view.day ? undefined : view.myTeam}
              padding={padding}
              className="absolute right-3 top-[7.5rem] md:right-[24.5rem] md:top-auto md:bottom-4"
            />
          </LiveCanvas>
        </APIProvider>
      ) : (
        team.data && <MapNotice kind="noMap" />
      )}
      {!mapReady && <MapLoading />}
      {notice && (
        <MapNotice
          kind={notice}
          onRetry={notice === 'error' ? () => void team.refetch() : undefined}
        />
      )}
      {replayBar}
      {!view.day && (
        <div className="pointer-events-none absolute inset-x-3 top-3 md:right-[24.5rem]">
          <HudBar
            counts={counts}
            filter={view.filter}
            onFilter={(next) => {
              view.setFilter(next);
              select(null);
            }}
            alerts={alerts}
            onAlerts={() => {
              view.setTab('alerts');
              if (!wide) setStop('half');
            }}
          />
        </div>
      )}
      <PanelFrame wide={wide} stop={stop} onStop={setStop} panel={panel} />
    </div>
  );
}

/** The people, today's sites and offices, and the open alerts, each refreshing on its own. */
function useLiveData() {
  const team = useLiveTeam();
  const sites = useLiveSites();
  const alerts = useLiveAlerts();
  return {
    team,
    people: team.data?.people ?? [],
    sites: sites.data?.sites ?? [],
    offices: sites.data?.offices ?? [],
    alertList: alerts.data?.alerts ?? [],
    alertsLoaded: alerts.data !== undefined,
    loaded: Boolean(team.data && sites.data),
  };
}

/** The panel: on the right on wide screens, a sheet over the map on phones. */
function PanelFrame({
  wide,
  stop,
  onStop,
  panel,
}: {
  readonly wide: boolean;
  readonly stop: SheetStop;
  readonly onStop: (stop: SheetStop) => void;
  readonly panel: LivePanelProps;
}) {
  if (wide)
    return (
      <aside className="live-glass live-pane absolute top-3 right-3 bottom-3 flex w-[22.5rem] flex-col overflow-hidden rounded-2xl">
        <PanelHeader {...panel} />
        <PanelBody {...panel} />
      </aside>
    );
  return (
    <BottomSheet stop={stop} onStop={onStop} header={<PanelHeader {...panel} />}>
      <PanelBody {...panel} />
    </BottomSheet>
  );
}

const paddingFor = (wide: boolean, day: boolean) => {
  if (!wide) return PHONE_PADDING;
  return day ? WIDE_DAY_PADDING : WIDE_PADDING;
};
