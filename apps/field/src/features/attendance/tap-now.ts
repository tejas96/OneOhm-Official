import type { MyWorkday } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import type { QueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { flushBeforeCheckOut } from '../duty/duty-flush';
import { readLocation } from './location';
import { outcomeOf } from './tap-queue';
import { sendTap, tapQueue } from './tap-sender';

/** What the phone could not read, for the note after the tap. */
function missedOf(wanted: boolean, reading: unknown): 'denied' | 'nofix' | null {
  if (!wanted) return null;
  if (reading === 'denied') return 'denied';
  return reading ? null : 'nofix';
}

/**
 * One tap on Check in or Check out. The time of the tap is taken first; the location is
 * read whenever the person has agreed and the policy is on (A8, the server filters by
 * hours). With no signal, or behind a tap already waiting, it is kept to send later (A9).
 */
export async function tapNow(
  kind: 'in' | 'out',
  workday: MyWorkday | undefined,
  client: QueryClient,
  userId: string,
) {
  const tappedAt = new Date().toISOString();
  if (kind === 'out') await flushBeforeCheckOut(userId);
  const wanted = Boolean(workday?.attendance.captureLocation && workday.consent.given);
  const reading = wanted ? await readLocation() : null;
  const position = reading && reading !== 'denied' ? reading : null;
  const missed = missedOf(wanted, reading);
  const keep = async () => {
    await tapQueue.add({ userId, kind, tappedAt, position });
    return { day: null, missed, queued: true };
  };
  // Behind a tap already waiting, so the two reach the server in the order they were made.
  if (tapQueue.mine(userId).length > 0) {
    const kept = await keep();
    void tapQueue
      .flush(sendTap, userId)
      .finally(() => client.invalidateQueries({ queryKey: keys.workday }));
    return kept;
  }
  try {
    const body = { position, tappedAt };
    const day = await unwrap(
      kind === 'in' ? api.workforce.checkIn({ body }) : api.workforce.checkOut({ body }),
    );
    return { day, missed, queued: false };
  } catch (error) {
    const outcome = outcomeOf(error);
    // No signal, or the session ended: the tap stays on the phone for this person.
    if (outcome === 'retry' || outcome === 'unauthorized') return keep();
    // Already checked in or out: an earlier send got through, so show the real day.
    if (outcome === 'done') return { day: null, missed: null, queued: false };
    throw error;
  }
}
