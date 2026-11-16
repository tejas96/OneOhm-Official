import type { Notice } from './notify';

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Mon, 9 Nov" for a calendar day. */
const dayLabel = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

/** "6:12 pm" in the business time zone. */
function clockLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
    .format(at)
    .replace(/\s?([ap])m$/i, (_, half: string) => ` ${half.toLowerCase()}m`);
}

export interface AutoClosedDay {
  readonly dayId: string;
  readonly workDate: string;
  readonly closedAt: Date;
  readonly timeZone: string;
}

/**
 * The night job ended a day nobody ended (live review A1). The person hears it first,
 * with how to put it right; their manager (or the people who approve corrections) hears
 * that the times are a guess from the last activity. No subject: both open the Attendance
 * list, so a person without it still gets the words.
 */
export function autoClosedNotice(who: 'self' | 'team', day: AutoClosedDay, name: string): Notice {
  const date = dayLabel(day.workDate);
  const time = clockLabel(day.closedAt, day.timeZone);
  return who === 'self'
    ? {
        kind: 'attendance_auto_closed',
        title: `Your ${date} was ended for you`,
        body: `You did not check out. We ended it at ${time}, your last activity. Wrong? Send a correction.`,
        dedupeKey: `attendance_auto_closed:${day.dayId}`,
      }
    : {
        kind: 'attendance_auto_closed',
        title: `${name} did not check out on ${date}`,
        body: `The day was ended at ${time}, their last activity. Fix the times if that is wrong.`,
        dedupeKey: `attendance_auto_closed_team:${day.dayId}`,
      };
}

/**
 * A check-in or check-out tap that waited 30 minutes to 12 hours for signal was accepted at
 * the phone's tap time. The manager reviews it; one alert per person's day, whichever tap.
 */
export function delayedTapNotice(
  input: {
    readonly dayId: string;
    readonly workDate: string;
    readonly kind: 'check_in' | 'check_out';
    readonly tappedAt: Date;
    readonly receivedAt: Date;
    readonly timeZone: string;
  },
  name: string,
): Notice {
  const what = input.kind === 'check_in' ? 'check-in' : 'check-out';
  return {
    kind: 'attendance_tap_delayed',
    title: `${name}'s ${what} on ${dayLabel(input.workDate)} came in late`,
    body: `Tapped at ${clockLabel(input.tappedAt, input.timeZone)}, received at ${clockLabel(input.receivedAt, input.timeZone)}. We used the tap time. Check it is right.`,
    dedupeKey: `attendance_tap_delayed:${input.dayId}`,
  };
}

/** A scheduled job still failing after its retries: the admin desk hears once a day per job. */
export function jobFailedNotice(job: string, error: string, today: string): Notice {
  return {
    kind: 'job_failed',
    title: `Background job failed: ${job.replaceAll('_', ' ')}`,
    body: `${error.slice(0, 200)} Open the job log in Settings.`,
    dedupeKey: `job_failed:${job}:${today}`,
  };
}
