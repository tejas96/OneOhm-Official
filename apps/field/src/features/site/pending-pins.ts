import type { GeoPoint } from '@oneohm/domain';

/**
 * Roof pins that could not be sent (no signal), one per task: only the last one counts.
 * Held on the phone until a re-send works, like checklist ticks.
 */
export function createPendingPins() {
  const pins = new Map<string, GeoPoint>();
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };
  return {
    get: (taskId: string): GeoPoint | null => pins.get(taskId) ?? null,
    keep(taskId: string, pin: GeoPoint) {
      pins.set(taskId, pin);
      tell();
    },
    /** Drops the pin once sent, unless a newer one was kept meanwhile. */
    drop(taskId: string, sent: GeoPoint) {
      const current = pins.get(taskId);
      if (!current || current.latitude !== sent.latitude || current.longitude !== sent.longitude)
        return;
      pins.delete(taskId);
      tell();
    },
    /** Drops any pin for the task: a newer save made it stale. */
    clear(taskId: string) {
      if (pins.delete(taskId)) tell();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
