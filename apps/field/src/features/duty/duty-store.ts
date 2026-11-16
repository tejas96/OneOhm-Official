import { Directory, File, Paths } from 'expo-file-system';
import { type DutyState, type DutyStore, parseDutyState } from './duty-queue';
import { staleDutyFiles } from './duty-state';

/** Everything the duty route keeps on the phone is in the app's own documents, in this folder. */
const folder = () => new Directory(Paths.document, 'duty');
const fileOf = (name: string) => {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, name);
};

async function read(name: string): Promise<unknown> {
  try {
    const saved = fileOf(name);
    return saved.exists ? JSON.parse(await saved.text()) : null;
  } catch {
    return null;
  }
}

/** One file per person: `points-<userId>.json`. */
export const dutyStore: DutyStore = {
  async load(userId): Promise<DutyState> {
    return parseDutyState(await read(`points-${userId}.json`));
  },
  async save(userId, state) {
    await fileOf(`points-${userId}.json`).write(JSON.stringify(state));
  },
};

/** Small settings that must outlive the app being closed. */
export interface DutyPrefs {
  /**
   * Who is on duty on this phone. The background task wakes with no screen and no session in
   * memory; it files the points under this person and stops itself when it is empty.
   */
  readonly activeUserId: string | null;
  /** The battery-saver hint was shown and closed. */
  readonly batteryHintSeen: boolean;
}

export async function readPrefs(): Promise<DutyPrefs> {
  const raw = (await read('prefs.json')) as Partial<DutyPrefs> | null;
  return {
    activeUserId: typeof raw?.activeUserId === 'string' ? raw.activeUserId : null,
    batteryHintSeen: raw?.batteryHintSeen === true,
  };
}

export async function writePrefs(patch: Partial<DutyPrefs>): Promise<void> {
  try {
    await fileOf('prefs.json').write(JSON.stringify({ ...(await readPrefs()), ...patch }));
  } catch {
    // Kept for this run only; the hint may show again.
  }
}

/** Deletes saved points files not written for 14 days. A person's newer file is never touched. */
export async function pruneOldFiles(now = Date.now()): Promise<void> {
  try {
    const files = folder()
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((entry) => ({
        entry,
        name: entry.name,
        modifiedAt: entry.info().modificationTime ?? null,
      }));
    const stale = new Set(staleDutyFiles(files, now));
    for (const file of files) if (stale.has(file.name)) file.entry.delete();
  } catch {
    // Left for the next start.
  }
}
