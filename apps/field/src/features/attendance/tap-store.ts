import { File, Paths } from 'expo-file-system';
import { parseTaps, type QueuedTap, type TapStore } from './tap-queue';

/** Taps waiting for signal live in one small JSON file in the app's own documents. */
const file = () => new File(Paths.document, 'pending-attendance.json');

export const tapStore: TapStore = {
  async load(): Promise<QueuedTap[]> {
    try {
      const saved = file();
      return saved.exists ? parseTaps(JSON.parse(await saved.text())) : [];
    } catch {
      return [];
    }
  },
  async save(items) {
    await file().write(JSON.stringify(items));
  },
};
