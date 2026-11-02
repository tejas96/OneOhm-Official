import type { GeoPoint } from '@oneohm/domain';
import type { createPendingPins } from './pending-pins';
import { shouldKeepPin } from './pin-flow';

type PendingPins = ReturnType<typeof createPendingPins>;

/**
 * Every site-location save for a task goes through one queue, so an older pin re-sent
 * from the phone can never land after a newer one. A newer save clears the kept pin.
 */
export function createPinSender<T>(
  pins: PendingPins,
  send: (taskId: string, pin: GeoPoint) => Promise<T>,
) {
  const queues = new Map<string, Promise<unknown>>();
  const inTurn = <R>(taskId: string, job: () => Promise<R>): Promise<R> => {
    const next = (queues.get(taskId) ?? Promise.resolve()).then(job, job);
    queues.set(
      taskId,
      next.catch(() => undefined),
    );
    return next;
  };
  return {
    /** Any other save (the GPS reading): waits its turn; once it works the kept pin is stale. */
    exclusive<R>(taskId: string, job: () => Promise<R>): Promise<R> {
      return inTurn(taskId, async () => {
        const result = await job();
        pins.clear(taskId);
        return result;
      });
    },
    /** The pin the worker just confirmed. Without signal it is kept to send again. */
    confirm(taskId: string, pin: GeoPoint): Promise<T> {
      // Newer than any kept pin, so that one is never sent.
      pins.clear(taskId);
      return inTurn(taskId, async () => {
        try {
          const result = await send(taskId, pin);
          pins.clear(taskId);
          return result;
        } catch (error) {
          if (shouldKeepPin(error)) pins.keep(taskId, pin);
          throw error;
        }
      });
    },
    /**
     * Sends the kept pin, if any, when its turn comes. Never rejects: no signal keeps it;
     * a refusal drops it and is handed back so the worker can be told.
     */
    resend(taskId: string): Promise<{ result?: T; refused: unknown }> {
      return inTurn(taskId, async () => {
        const pin = pins.get(taskId);
        if (!pin) return { refused: null };
        try {
          const result = await send(taskId, pin);
          pins.drop(taskId, pin);
          return { result, refused: null };
        } catch (error) {
          if (shouldKeepPin(error)) return { refused: null };
          pins.drop(taskId, pin);
          return { refused: error };
        }
      });
    },
  };
}
