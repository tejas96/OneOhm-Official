import type { RouteMode } from './duty-state';

/** What the Today card shows about the route: how it records and whether uploads are stuck. */
interface DutyStatus {
  readonly mode: RouteMode;
  /** The last upload met no signal. */
  readonly stalled: boolean;
  /** The "Allow all the time" explanation should be open. */
  readonly explain: boolean;
}

let status: DutyStatus = { mode: 'off', stalled: false, explain: false };
const listeners = new Set<() => void>();

export const dutyStatus = {
  get: (): DutyStatus => status,
  set(patch: Partial<DutyStatus>) {
    const next = { ...status, ...patch };
    if (
      next.mode === status.mode &&
      next.stalled === status.stalled &&
      next.explain === status.explain
    )
      return;
    status = next;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
