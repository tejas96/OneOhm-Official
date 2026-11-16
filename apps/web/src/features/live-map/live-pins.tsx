'use client';

import type { LivePerson, LiveSites } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';
import { useLayoutEffect } from 'react';
import type { Selection } from './live-canvas';
import { type LiveFilter, matchesFilter, pinCaption } from './live-format';
import { SitePin, WorkerPin } from './map-pins';
import { usePinLayout } from './overlay-layer';

interface LivePinsProps {
  readonly people: readonly LivePerson[];
  readonly sites: LiveSites['sites'];
  readonly filter: LiveFilter;
  readonly selection: Selection;
  readonly onSelect: (selection: Selection) => void;
}

/**
 * The people and today's sites as pins. This render says what each pin looks like; after it,
 * every pin's place is handed to the layout, which glides a worker who moved since the last
 * refresh and leaves the rest exactly where they are.
 */
export function LivePins({ people, sites, filter, selection, onSelect }: LivePinsProps) {
  const t = useTranslations('liveMap');
  const layout = usePinLayout();
  const placed = people.filter((person) => person.position);
  const showSites = filter === 'all' || filter === 'on_duty';
  const isSelected = (kind: 'person' | 'site', id: string) =>
    selection?.kind === kind && selection.id === id;
  useLayoutEffect(() => {
    for (const person of placed) {
      const { position } = person;
      const id = person.person.id;
      const shown = matchesFilter(person.state, filter);
      layout.place(id, 'worker', position && { lat: position.latitude, lng: position.longitude }, {
        caption: shown ? pinCaption(person) : null,
        priority: captionPriority(person, isSelected('person', id)),
      });
    }
    if (showSites)
      for (const site of sites)
        layout.place(site.id, 'site', { lat: site.latitude, lng: site.longitude });
    layout.commit();
  });
  return (
    <>
      {showSites &&
        sites.map((site) => (
          <SitePin
            key={site.id}
            site={site}
            label={t('pin.site', { job: site.label, status: t(`siteStatus.${site.status}`) })}
            selected={isSelected('site', site.id)}
            onSelect={() => onSelect({ kind: 'site', id: site.id })}
          />
        ))}
      {placed.map((person) => (
        <WorkerPin
          key={person.person.id}
          person={person}
          label={t('pin.person', {
            name: person.person.fullName,
            state: t(`state.${person.state}`),
          })}
          caption={matchesFilter(person.state, filter) ? pinCaption(person) : null}
          selected={isSelected('person', person.person.id)}
          dimmed={!matchesFilter(person.state, filter)}
          onSelect={() => onSelect({ kind: 'person', id: person.person.id })}
        />
      ))}
    </>
  );
}

/** Whose caption wins a tight spot: picked, then any alert, then moving, on a visit, idle. */
const STATE_PRIORITY: Partial<Record<LivePerson['state'], number>> = {
  moving: 3,
  on_visit: 2,
  idle: 1,
};
function captionPriority(person: LivePerson, selected: boolean): number {
  if (selected) return 9;
  if (person.alerts.open > 0) return person.alerts.red > 0 ? 5 : 4;
  return STATE_PRIORITY[person.state] ?? 0;
}
