import { ChoiceChips } from '@oneohm/mobile-ui';
import { useState } from 'react';
import { FOLLOW_UP_DATES } from '@/copy/sales';
import { addDays, businessToday, relativeDate, shortDate } from '@/lib/dates';

const OFFSETS = { today: 0, tomorrow: 1, in3: 3, week: 7 } as const;
type Offset = keyof typeof OFFSETS;
const OTHER = 'other';
/** How far ahead "Another day" reaches. */
const DAYS_AHEAD = 60;

/**
 * The next follow-up: one tap for today, tomorrow, in 3 days or next week, or
 * "Another day" for any day in the next two months.
 */
export function FollowUpDates({
  value,
  onChange,
  label,
}: {
  readonly value: string;
  readonly onChange: (date: string) => void;
  readonly label: string;
}) {
  const today = businessToday();
  const quick = (Object.keys(OFFSETS) as Offset[]).map((key) => {
    const date = addDays(today, OFFSETS[key]);
    return {
      value: date,
      label:
        key === 'today' || key === 'tomorrow'
          ? FOLLOW_UP_DATES[key]
          : `${FOLLOW_UP_DATES[key]} · ${shortDate(date)}`,
    };
  });
  const isQuick = quick.some((choice) => choice.value === value);
  const [picking, setPicking] = useState(!isQuick);
  const days = Array.from({ length: DAYS_AHEAD }, (_, index) => {
    const date = addDays(today, index);
    return { value: date, label: shortDate(date) };
  });
  return (
    <>
      <ChoiceChips
        label={label}
        choices={[...quick, { value: OTHER, label: FOLLOW_UP_DATES.other }]}
        value={picking ? OTHER : value}
        onChange={(next) => {
          if (next === OTHER) {
            setPicking(true);
            return;
          }
          setPicking(false);
          onChange(next);
        }}
      />
      {picking ? (
        <ChoiceChips
          label={FOLLOW_UP_DATES.other}
          choices={days}
          value={value}
          onChange={onChange}
        />
      ) : null}
    </>
  );
}

/** Half-hour times across the working day; "Any time" leaves it open. */
const TIMES = Array.from({ length: 25 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});
const ANY = 'any';

/** "16:30" as "4:30 pm". */
export function clockLabel(time: string): string {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * An optional time for the follow-up; the owner is alerted a little before it.
 * `minTime` ("HH:MM") hides the slots before it, for a follow-up today.
 */
export function FollowUpTime({
  value,
  onChange,
  label,
  minTime,
}: {
  readonly value: string | null;
  readonly onChange: (time: string | null) => void;
  readonly label: string;
  readonly minTime?: string | undefined;
}) {
  const choices = [
    { value: ANY, label: FOLLOW_UP_DATES.anyTime },
    ...TIMES.filter((time) => !minTime || time >= minTime).map((time) => ({
      value: time,
      label: clockLabel(time),
    })),
  ];
  return (
    <ChoiceChips
      label={label}
      choices={choices}
      value={value ?? ANY}
      onChange={(next) => onChange(next === ANY ? null : next)}
    />
  );
}

export function defaultFollowUp(): string {
  return addDays(businessToday(), 1);
}

/** "tomorrow" or "tomorrow at 4:30 pm" for a lead's next follow-up. */
export function whenLabel(lead: {
  readonly nextActionOn: string | null;
  readonly nextActionTime: string | null;
}): string {
  if (!lead.nextActionOn) return '';
  const day = relativeDate(lead.nextActionOn);
  return lead.nextActionTime ? `${day} at ${clockLabel(lead.nextActionTime)}` : day;
}
