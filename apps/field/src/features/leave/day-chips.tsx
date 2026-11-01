import { ChoiceChips, Field } from '@oneohm/mobile-ui';
import { addDays, BUSINESS_TIME_ZONE } from '@/lib/dates';

const label = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: BUSINESS_TIME_ZONE,
});

/** A labelled, scrollable row of days from `start`, `count` long: one tap picks a date. */
export function DayChips({
  label: title,
  start,
  count,
  value,
  onChange,
}: {
  readonly label: string;
  readonly start: string;
  readonly count: number;
  readonly value: string | null;
  readonly onChange: (date: string) => void;
}) {
  const choices = Array.from({ length: count }, (_, offset) => {
    const date = addDays(start, offset);
    return { value: date, label: label.format(new Date(`${date}T12:00:00+05:30`)) };
  });
  return (
    <Field label={title}>
      <ChoiceChips label={title} choices={choices} value={value} onChange={onChange} />
    </Field>
  );
}
