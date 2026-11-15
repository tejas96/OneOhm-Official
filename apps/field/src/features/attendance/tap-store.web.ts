import { parseTaps, type TapStore } from './tap-queue';

/** The browser preview keeps waiting taps in localStorage, or for the tab when it is blocked. */
const KEY = 'oneohm-field-pending-attendance';
let memory = '[]';

export const tapStore: TapStore = {
  async load() {
    try {
      return parseTaps(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? memory));
    } catch {
      return [];
    }
  },
  async save(items) {
    memory = JSON.stringify(items);
    try {
      globalThis.localStorage?.setItem(KEY, memory);
    } catch {
      // Kept for the tab only.
    }
  },
};
