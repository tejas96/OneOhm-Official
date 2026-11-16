'use client';

import { todayIn } from '@oneohm/shared';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useEffect, useState } from 'react';
import { useMapsConfig } from '@/features/maps/use-maps-config';
import { usePeople } from '@/features/team/use-team';
import type { CameraCommand } from '../live-canvas';
import { LiveCanvas } from '../live-canvas';
import { MapControls } from '../map-controls';
import { MapLoading, MapNotice } from '../map-notice';
import { useWideScreen } from '../use-live';
import { DayPins, DayRoute } from './day-map';
import { DayPanel } from './day-panel';
import { ReplayBar } from './replay-bar';
import { dayPlaces, segmentPlaces, useDayView } from './use-day-view';
import '../live-map.css';
import '../live-pins.css';

/** The panel and the map buttons on the right: no pin lands under a button after a fit. */
const PADDING = { top: 48, right: 496, bottom: 120, left: 72 };
const PHONE_PADDING = { top: 96, right: 100, bottom: 320, left: 24 };

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** A person's day on its own page, for those who may read the route but have no live map. */
export function DayPage({
  personId,
  date,
}: {
  readonly personId: string;
  readonly date: string | null;
}) {
  const { browserKey, mapId } = useMapsConfig();
  const today = todayIn();
  const [day, setDay] = useState(date ?? today);
  const view = useDayView(personId, day);
  const people = usePeople();
  const wide = useWideScreen();
  const [satellite, setSatellite] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const fit = (points: CameraCommand['points']) =>
    setCamera((before) => ({ seq: (before?.seq ?? 0) + 1, mode: 'fit', points }));
  const data = view.query.data;
  const key = data ? `${data.userId}:${data.date}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per day shown.
  useEffect(() => {
    if (data) fit(dayPlaces(data));
  }, [key]);
  const known = people.data?.find((row) => row.id === personId);
  const person = known
    ? {
        id: known.id,
        fullName: known.fullName,
        initials: initialsOf(known.fullName),
        avatarSwatch: 0,
      }
    : null;
  const padding = wide ? PADDING : PHONE_PADDING;
  return (
    <div className="relative -mx-4 -my-6 h-[calc(100dvh-3.5rem)] overflow-hidden bg-sunken sm:-mx-6 md:-mx-10 md:-my-9 md:h-dvh">
      {browserKey ? (
        <APIProvider apiKey={browserKey}>
          <LiveCanvas
            mapId={mapId}
            satellite={satellite}
            camera={camera}
            padding={padding}
            onMapClick={() => undefined}
            onReady={() => setMapReady(true)}
            shapes={null}
            pins={
              data && (
                <DayPins
                  day={data}
                  at={view.at}
                  initials={person?.initials ?? ''}
                  swatch={person?.avatarSwatch ?? 0}
                  highlight={view.highlight}
                />
              )
            }
          >
            {data && <DayRoute points={view.replay.points} highlight={view.highlight} />}
            <MapControls
              satellite={satellite}
              onSatellite={setSatellite}
              onFitAll={() => fit(dayPlaces(data))}
              padding={padding}
              className="absolute right-3 top-24 md:right-[24.5rem] md:top-auto md:bottom-4"
            />
          </LiveCanvas>
        </APIProvider>
      ) : (
        <MapNotice kind="noMap" />
      )}
      {!mapReady && browserKey && <MapLoading />}
      {data && (
        <div className="pointer-events-none absolute inset-x-3 top-3 md:top-auto md:right-[28rem] md:bottom-4 md:left-4">
          <ReplayBar
            replay={view.replay}
            segments={data.segments}
            className="md:mx-auto md:max-w-3xl"
          />
        </div>
      )}
      <aside className="live-glass live-pane absolute inset-x-3 bottom-3 flex max-h-[45%] flex-col overflow-hidden rounded-2xl pt-4 md:inset-x-auto md:top-3 md:right-3 md:max-h-none md:w-[22.5rem]">
        <DayPanel
          person={person}
          date={day}
          today={today}
          onDate={setDay}
          query={view.query}
          active={view.active}
          picked={view.picked}
          onPick={(index) => {
            view.pick(index);
            const segment = data?.segments[index];
            if (segment) fit(segmentPlaces(segment, view.replay.points));
          }}
        />
      </aside>
    </div>
  );
}
