import type { DutyState, DutyStore } from './duty-queue';

/** The browser preview records no route (nothing runs on duty there); this only satisfies imports. */
export const dutyStore: DutyStore = {
  async load(): Promise<DutyState> {
    return { points: [], dropped: 0 };
  },
  async save() {
    // Nothing is kept on the web.
  },
};

export interface DutyPrefs {
  readonly activeUserId: string | null;
  readonly batteryHintSeen: boolean;
}

export async function readPrefs(): Promise<DutyPrefs> {
  return { activeUserId: null, batteryHintSeen: true };
}

export async function writePrefs(): Promise<void> {
  // Nothing is kept on the web.
}

export async function pruneOldFiles(): Promise<void> {
  // Nothing is kept on the web.
}
