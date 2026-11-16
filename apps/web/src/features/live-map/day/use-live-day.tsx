'use client';

import type { DutyAlert, LivePerson } from '@oneohm/api-contracts';
import { useEffect } from 'react';
import type { LiveView } from '../use-live-view';
import { DayPins, DayRoute } from './day-map';
import { DayPanel, type DayPerson } from './day-panel';
import { ReplayBar } from './replay-bar';
import { dayPlaces, segmentPlaces, useDayView } from './use-day-view';

/** Who an open day belongs to: from the live list, else from an alert about them. */
export function dayPersonOf(
  id: string | undefined,
  people: readonly LivePerson[],
  alerts: readonly DutyAlert[],
): DayPerson | null {
  if (!id) return null;
  const live = people.find((row) => row.person.id === id);
  if (live) return live.person;
  const named = alerts.find((row) => row.person.id === id)?.person;
  if (!named) return null;
  const initials = named.fullName
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2);
  return { id, fullName: named.fullName, initials, avatarSwatch: 0 };
}

/**
 * A day opened over the live map: fitted once when it arrives; a picked segment jumps the
 * replay and is brought into view. Gives the panel to show and whose day it is.
 */
export function useLiveDay({
  view,
  people,
  alerts,
  onPicked,
}: {
  readonly view: LiveView;
  readonly people: readonly LivePerson[];
  readonly alerts: readonly DutyAlert[];
  readonly onPicked: () => void;
}) {
  const dayView = useDayView(view.day?.personId ?? null, view.day?.date ?? view.today);
  const day = dayView.query.data;
  const { move } = view;
  const dayKey = day ? `${day.userId}:${day.date}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opened day.
  useEffect(() => {
    if (dayKey && day) move('fit', dayPlaces(day));
  }, [dayKey]);
  const dayPerson = dayPersonOf(view.day?.personId, people, alerts);
  const pickSegment = (index: number) => {
    dayView.pick(index);
    const segment = day?.segments[index];
    if (segment) move('fit', segmentPlaces(segment, dayView.replay.points));
    onPicked();
  };
  const open = view.day;
  const dayPanel = open && (
    <DayPanel
      person={dayPerson}
      date={open.date}
      today={view.today}
      onDate={(date) => view.setDay({ ...open, date })}
      query={dayView.query}
      active={dayView.active}
      picked={dayView.picked}
      onPick={pickSegment}
    />
  );
  const dayPins = day && (
    <DayPins
      day={day}
      at={dayView.at}
      initials={dayPerson?.initials ?? ''}
      swatch={dayPerson?.avatarSwatch ?? 0}
      highlight={dayView.highlight}
    />
  );
  const dayRoute = day && <DayRoute points={dayView.replay.points} highlight={dayView.highlight} />;
  const replayBar = open && day && (
    <div className="pointer-events-none absolute inset-x-3 top-3 md:top-auto md:right-[28rem] md:bottom-4 md:left-4">
      <ReplayBar
        replay={dayView.replay}
        segments={day.segments}
        className="md:mx-auto md:max-w-3xl"
      />
    </div>
  );
  return { day, dayPins, dayRoute, replayBar, dayPanel, fitDay: () => move('fit', dayPlaces(day)) };
}
