import { unwrap } from '@oneohm/mobile-ui';
import { api } from '@/api/api';
import { createTapQueue, type QueuedTap } from './tap-queue';
import { tapStore } from './tap-store';

/** Check-ins and check-outs kept on this phone for want of signal, oldest first. */
export const tapQueue = createTapQueue(tapStore);

/** Sends one kept tap with the time it was made, so a late send is not judged late. */
export const sendTap = (tap: QueuedTap) => {
  const body = { position: tap.position, tappedAt: tap.tappedAt };
  return unwrap(
    tap.kind === 'in' ? api.workforce.checkIn({ body }) : api.workforce.checkOut({ body }),
  );
};
