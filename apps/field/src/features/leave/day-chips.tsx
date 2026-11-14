import { ChoiceChips, Field } from '@oneohm/mobile-ui';
import { REQUEST_LEAVE } from '@/copy/workforce';
import { addDays, BUSINESS_TIME_ZONE } from '@/lib/dates';

const label = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: BUSINESS_TIME_ZONE,
});

/** Days that are not working days: the weekly offs and the holidays (from the workday). */
export interface OffDays {
  readonly weeklyOff: readonly number[];
  readonly holidays: ReadonlySet<string>;
}

/**
 * A labelled, scrollable row of days from `start`, `count` long: one tap picks a date.
 * A weekly off or a holiday says so on its chip ("Sun, 15 Nov · Off"); it is never counted.
 */
export function DayChips({
  label: title,
  start,
  count,
  value,
  onChange,
  off,
}: {
  readonly label: string;
  readonly start: string;
  readonly count: number;
  readonly value: string | null;
  readonly onChange: (date: string) => void;
  readonly off?: OffDays | undefined;
}) {
  const choices = Array.from({ length: count }, (_, offset) => {
    const date = addDays(start, offset);
    const day = label.format(new Date(`${date}T12:00:00+05:30`));
    const tag = !off
      ? null
      : off.holidays.has(date)
        ? REQUEST_LEAVE.holidayTag
        : off.weeklyOff.includes(new Date(`${date}T00:00:00Z`).getUTCDay())
          ? REQUEST_LEAVE.offTag
          : null;
    return { value: date, label: tag ? `${day} · ${tag}` : day };
  });
  return (
    <Field label={title}>
      <ChoiceChips label={title} choices={choices} value={value} onChange={onChange} />
    </Field>
  );
}
