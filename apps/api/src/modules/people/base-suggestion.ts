import { type DatabaseExecutor, readTravelFacts } from '@oneohm/database';
import { suggestBase } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { currentCalendar } from '../../common/calendar';

const DAYS = 7;

/**
 * A base place from where the person's duty started over the last 7 days (today included): the
 * check-in position of each day, else its first kept route point; the median of them.
 */
export async function baseSuggestion(db: DatabaseExecutor, userId: string) {
  const today = todayIn(currentCalendar().timeZone);
  const dates = Array.from({ length: DAYS }, (_, back) => addDays(today, -back));
  const facts = await Promise.all(dates.map((date) => readTravelFacts(db, userId, date)));
  const starts = facts.flatMap((day) => (day.start ? [day.start] : []));
  const middle = suggestBase(starts);
  return { suggestion: middle ? { ...middle, days: starts.length } : null };
}
