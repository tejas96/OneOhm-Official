'use client';

import type { LivePerson, LiveSites } from '@oneohm/api-contracts';
import { DARK_COLORS, LIGHT_COLORS } from '@oneohm/design-system/tokens';
import { Map as GoogleMap, useMap } from '@vis.gl/react-google-maps';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import { fanOut, visibleCaptions } from './label-layout';
import { type LiveFilter, matchesFilter, pinCaption } from './live-format';
import { SitePin, WorkerPin } from './map-pins';
import { MapShapes } from './map-shapes';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from './map-style';
import { OverlayLayer, useProjection } from './overlay-layer';
import { useDarkTheme } from './use-live';

/** Captions show from this zoom in; further out the pins speak for themselves. */
const CAPTION_ZOOM = 12;
/** Fit all never comes closer than a street, even for one person. */
const FIT_MAX_ZOOM = 16;
const INDIA = { lat: 20.6, lng: 78.9 };

export type Selection = { kind: 'person' | 'site'; id: string } | null;

export interface CanvasProps {
  readonly people: readonly LivePerson[];
  readonly sites: LiveSites['sites'];
  readonly offices: LiveSites['offices'];
  readonly filter: LiveFilter;
  readonly selection: Selection;
  readonly onSelect: (selection: Selection) => void;
  readonly satellite: boolean;
  /** Bumped by Fit all and once when the first data arrives; 0 fits nothing. */
  readonly fitSignal: number;
  /** Room the panes take over the map, so Fit all keeps everything in the clear part. */
  readonly padding: google.maps.Padding;
  /** The first map tiles are drawn: the loading skeleton can go. */
  readonly onReady: () => void;
  readonly children?: ReactNode;
}

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
      onClick={() => props.onSelect(null)}
      onTilesLoaded={props.onReady}
    >
      <OverlayLayer
        shapes={<MapShapes people={props.people} offices={props.offices} />}
        pins={<Pins {...props} />}
      />
      <Fit {...props} />
      {props.children}
    </GoogleMap>
  );
}

function Pins({ people, sites, filter, selection, onSelect }: CanvasProps) {
  const t = useTranslations('liveMap');
  const { toPixel, zoom } = useProjection();
  const placed = people.filter((person) => person.position);
  const isSelected = (kind: 'person' | 'site', id: string) =>
    selection?.kind === kind && selection.id === id;
  // Worked out on every draw: the projection changes with each zoom. People at one spot are
  // fanned out on a ring; the card still shows their true position.
  const drawn = fanOut(
    placed.flatMap((person) =>
      person.position
        ? [
            {
              id: person.person.id,
              ...toPixel(person.position.latitude, person.position.longitude),
            },
          ]
        : [],
    ),
  );
  const captions =
    zoom < CAPTION_ZOOM
      ? new Set<string>()
      : visibleCaptions(
          placed
            .filter((person) => matchesFilter(person.state, filter))
            .flatMap((person) => {
              const at = drawn.get(person.person.id);
              if (!at) return [];
              const priority = isSelected('person', person.person.id)
                ? 9
                : person.state === 'moving'
                  ? 2
                  : 1;
              return [{ id: person.person.id, ...at, text: pinCaption(person), priority }];
            }),
        );
  return (
    <>
      {filter === 'all' || filter === 'on_duty'
        ? sites.map((site) => (
            <SitePin
              key={site.id}
              site={site}
              label={t('pin.site', { job: site.label, status: t(`siteStatus.${site.status}`) })}
              selected={isSelected('site', site.id)}
              onSelect={() => onSelect({ kind: 'site', id: site.id })}
            />
          ))
        : null}
      {placed.map((person) => (
        <WorkerPin
          key={person.person.id}
          person={person}
          at={drawn.get(person.person.id) ?? null}
          label={t('pin.person', {
            name: person.person.fullName,
            state: t(`state.${person.state}`),
          })}
          caption={captions.has(person.person.id) ? pinCaption(person) : null}
          selected={isSelected('person', person.person.id)}
          dimmed={!matchesFilter(person.state, filter)}
          onSelect={() => onSelect({ kind: 'person', id: person.person.id })}
        />
      ))}
    </>
  );
}

/** Fits the people and sites on screen: once when they first arrive, and on Fit all. */
function Fit({ people, sites, offices, filter, fitSignal, padding, selection }: CanvasProps) {
  const map = useMap();
  const fitted = useRef<number | null>(null);
  const hasData = people.some((person) => person.position) || sites.length + offices.length > 0;
  useEffect(() => {
    if (!map || !hasData || fitSignal === 0 || fitted.current === fitSignal) return;
    fitted.current = fitSignal;
    const bounds = new google.maps.LatLngBounds();
    for (const person of people)
      if (person.position && matchesFilter(person.state, filter))
        bounds.extend({ lat: person.position.latitude, lng: person.position.longitude });
    for (const site of sites) bounds.extend({ lat: site.latitude, lng: site.longitude });
    if (bounds.isEmpty())
      for (const office of offices) bounds.extend({ lat: office.latitude, lng: office.longitude });
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, padding);
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM);
    });
  }, [map, hasData, fitSignal, people, sites, offices, filter, padding]);
  // A pin chosen from the list is brought into view if it is off screen.
  const target = selection
    ? selection.kind === 'person'
      ? people.find((person) => person.person.id === selection.id)?.position
      : sites.find((site) => site.id === selection.id)
    : null;
  const lat = target?.latitude;
  const lng = target?.longitude;
  useEffect(() => {
    if (!map || lat === undefined || lng === undefined) return;
    if (!map.getBounds()?.contains({ lat, lng })) map.panTo({ lat, lng });
  }, [map, lat, lng]);
  return null;
}
