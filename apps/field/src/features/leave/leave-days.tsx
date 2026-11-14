import { ChoiceChips, Text } from '@oneohm/mobile-ui';
import { REQUEST_LEAVE } from '@/copy/workforce';
import { useWorkday } from '@/features/attendance/use-workday';
import { addDays, businessToday } from '@/lib/dates';
import { DayChips, type OffDays } from './day-chips';
import type { LeaveForm, LeaveKind, LeaveLength } from './use-leave-form';

/** Planned or emergency, the first and last day, and full or half for a single day. */
export function LeaveDays({ form }: { readonly form: LeaveForm }) {
  const today = businessToday();
  const emergency = form.kind === 'emergency';
  const calendar = useWorkday().data?.calendar;
  const off: OffDays | undefined = calendar && {
    weeklyOff: calendar.weeklyOff,
    holidays: new Set(calendar.upcomingHolidays.map((holiday) => holiday.day)),
  };
  return (
    <>
      <ChoiceChips<LeaveKind>
        kind="segmented"
        label={REQUEST_LEAVE.requestKind}
        choices={[
          { value: 'planned', label: REQUEST_LEAVE.planned },
          { value: 'emergency', label: REQUEST_LEAVE.emergencyShort },
        ]}
        value={form.kind}
        onChange={form.setKind}
      />
      {emergency ? (
        <Text variant="bodySm" tone="secondary">
          {REQUEST_LEAVE.emergencyHint}
        </Text>
      ) : null}
      <DayChips
        label={REQUEST_LEAVE.from}
        start={emergency ? addDays(today, -7) : today}
        count={emergency ? 22 : 30}
        value={form.from}
        onChange={form.setFrom}
        off={off}
      />
      {form.from ? (
        <DayChips
          label={REQUEST_LEAVE.to}
          start={form.from}
          count={15}
          value={form.last}
          onChange={form.setTo}
          off={off}
        />
      ) : null}
      {form.oneDay ? (
        <ChoiceChips<LeaveLength>
          kind="segmented"
          label={REQUEST_LEAVE.length}
          choices={[
            { value: 'full', label: REQUEST_LEAVE.fullDay },
            { value: 'half', label: REQUEST_LEAVE.halfDay },
          ]}
          value={form.length}
          onChange={form.setLength}
        />
      ) : null}
    </>
  );
}
