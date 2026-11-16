'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import { useEffect, useState } from 'react';
import { useMapsKey } from '@/features/maps/use-maps-config';
import { BottomSheet, type SheetStop } from './bottom-sheet';
import { HudBar } from './hud-bar';
import { LiveCanvas, type Selection } from './live-canvas';
import { type LiveFilter, liveCounts } from './live-format';
import { PanelBody, PanelHeader } from './live-panel';
import { MapControls } from './map-controls';
import { MapLoading, MapNotice, noticeFor } from './map-notice';
import { useLiveSites, useLiveTeam, useWideScreen } from './use-live';
import './live-map.css';
import './live-pins.css';

/** Room the panes take over the map, for Fit all. */
const WIDE_PADDING = { top: 104, right: 400, bottom: 48, left: 48 };
const PHONE_PADDING = { top: 132, right: 28, bottom: 200, left: 28 };

/**
 * The manager's live map (Duty Day step 4): the whole screen is the map; the numbers float on
 * top, the people and the picked card sit in a panel (a sheet on phones). Refreshes every 30 s.
 */
export function LiveMapView() {
  const browserKey = useMapsKey();
  const team = useLiveTeam();
  const sitesQuery = useLiveSites();
  const wide = useWideScreen();
  const [filter, setFilter] = useState<LiveFilter>('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [satellite, setSatellite] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [stop, setStop] = useState<SheetStop>('peek');
  const [mapReady, setMapReady] = useState(false);
  const loaded = Boolean(team.data && sitesQuery.data);
  useEffect(() => {
    if (loaded) setFitSignal((signal) => (signal === 0 ? 1 : signal));
  }, [loaded]);
  const people = team.data?.people ?? [];
  const sites = sitesQuery.data?.sites ?? [];
  const counts = liveCounts(people);
  const select = (next: Selection) => {
    setSelection(next);
    if (!wide && next) setStop('half');
  };
  const filterBy = (next: LiveFilter) => {
    setFilter(next);
    setSelection(null);
  };
  const panel = {
    people,
    sites,
    onDuty: counts.on_duty,
    filter,
    onClearFilter: () => setFilter('all'),
    selection,
    onSelect: select,
    updatedAt: team.dataUpdatedAt,
    failed: team.isError,
  };
  const notice = noticeFor({
    failed: team.isError,
    loaded: Boolean(team.data),
    picked: selection !== null,
    people: people.length,
    onDuty: counts.on_duty,
  });
  return (
    <div className="relative -mx-4 -my-6 h-[calc(100dvh-3.5rem)] overflow-hidden bg-sunken sm:-mx-6 md:-mx-10 md:-my-9 md:h-dvh">
      {browserKey ? (
        <APIProvider apiKey={browserKey}>
          <LiveCanvas
            people={people}
            sites={sites}
            offices={sitesQuery.data?.offices ?? []}
            filter={filter}
            selection={selection}
            onSelect={select}
            satellite={satellite}
            fitSignal={fitSignal}
            padding={wide ? WIDE_PADDING : PHONE_PADDING}
            onReady={() => setMapReady(true)}
          >
            <MapControls
              satellite={satellite}
              onSatellite={setSatellite}
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
      <div className="pointer-events-none absolute inset-x-3 top-3 md:right-[24.5rem]">
        <HudBar
          counts={counts}
          filter={filter}
          onFilter={filterBy}
          onFit={() => setFitSignal((signal) => signal + 1)}
        />
      </div>
      {wide ? (
        <aside className="live-glass live-pane absolute top-3 right-3 bottom-3 flex w-[22.5rem] flex-col overflow-hidden rounded-2xl">
          <PanelHeader {...panel} />
          <PanelBody {...panel} />
        </aside>
      ) : (
        <BottomSheet stop={stop} onStop={setStop} header={<PanelHeader {...panel} />}>
          <PanelBody {...panel} />
        </BottomSheet>
      )}
    </div>
  );
}
