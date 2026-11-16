import { unwrap } from '@oneohm/mobile-ui';
import { api, currentToken, setToken, tokenStore } from '@/api/api';
import type { DutyPoint } from './duty-point';
import { createDutyQueue } from './duty-queue';
import { dutyStore } from './duty-store';

/** Route points kept on this phone until they reach the server. */
export const dutyQueue = createDutyQueue(dutyStore);

/**
 * Uploads one batch. The background task can wake with the app closed and no sign-in in
 * memory, so the saved session is read first; without one the answer is a 401 and the run
 * stops until the person signs in.
 */
export async function sendDutyPoints(points: readonly DutyPoint[]) {
  if (!currentToken()) {
    const saved = await tokenStore.read();
    if (saved) setToken(saved);
  }
  return unwrap(api.dutyPoints.uploadDutyPoints({ body: { points: [...points] } }));
}
