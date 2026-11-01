import { ChoiceChips } from '@oneohm/mobile-ui';
import { FOLLOW_UP_DATES } from '@/copy/sales';
import { addDays, businessToday, shortDate } from '@/lib/dates';

const OFFSETS = { today: 0, tomorrow: 1, in3: 3, week: 7 } as const;
type Offset = keyof typeof OFFSETS;

/** The next follow-up as one tap: today, tomorrow, in 3 days or next week. */
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
  const choices = (Object.keys(OFFSETS) as Offset[]).map((key) => {
    const date = addDays(today, OFFSETS[key]);
    return {
      value: date,
      label:
        key === 'today' || key === 'tomorrow'
          ? FOLLOW_UP_DATES[key]
          : `${FOLLOW_UP_DATES[key]} · ${shortDate(date)}`,
    };
  });
  return <ChoiceChips label={label} choices={choices} value={value} onChange={onChange} />;
}

export function defaultFollowUp(): string {
  return addDays(businessToday(), 1);
}
