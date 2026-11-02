import type { TaskSite } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { api } from '@/api/api';
import { createPendingPins } from './pending-pins';
import { createPinSender } from './pin-sender';

/** Roof pins kept on this phone for want of signal (one per task). */
export const pendingPins = createPendingPins();

/** The one path every site-location save for a task goes through, in order. */
export const pinQueue = createPinSender<TaskSite>(pendingPins, (taskId, pin) =>
  unwrap(
    api.siteActivity.saveSiteLocation({
      params: { id: taskId },
      body: { pin: { latitude: pin.latitude, longitude: pin.longitude } },
    }),
  ),
);
