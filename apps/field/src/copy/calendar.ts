/** English (India) copy for working time and holidays in the field app. */
export const CALENDAR = {
  overline: 'Working time',
  lunch: (span: string) => `Lunch ${span}`,
  holidays: 'Holidays ahead',
  none: 'No holidays added yet. Ask the office if you are not sure.',
  today: 'Today',
  tomorrow: 'Tomorrow',
  inDays: (days: number) => `In ${days} days`,
  more: (count: number) => `+${count} more later this year`,
  notCounted: 'Holidays are never counted as leave.',
} as const;
