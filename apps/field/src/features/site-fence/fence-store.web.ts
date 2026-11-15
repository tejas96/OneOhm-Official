import type { DutySiteRecord } from '@oneohm/api-contracts';
import type { FenceStore } from './fence-queue';
import { EMPTY_STATE, type FenceState } from './fence-state';

/** The browser preview watches no site fence; this only satisfies imports. */
export const fenceStore: FenceStore = {
  async load() {
    return [];
  },
  async save() {
    // Nothing is kept on the web.
  },
};

export async function writeFenceSites(): Promise<void> {
  // Nothing is kept on the web.
}

export async function readFenceSites(): Promise<readonly DutySiteRecord[]> {
  return [];
}

export async function readFenceState(): Promise<FenceState> {
  return EMPTY_STATE;
}

export async function updateFenceState(
  _userId: string,
  change: (state: FenceState) => FenceState,
): Promise<FenceState> {
  return change(EMPTY_STATE);
}
