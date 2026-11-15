import type { DutySiteRecord } from '@oneohm/api-contracts';
import { Directory, File, Paths } from 'expo-file-system';
import { type FenceStore, parseFences, type QueuedFence } from './fence-queue';
import { EMPTY_STATE, type FenceState, parseState } from './fence-state';

const folder = () => new Directory(Paths.document, 'duty');
const fileOf = (name: string) => {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, name);
};

/** Fence events waiting for signal live in one small JSON file in the app's own documents. */
export const fenceStore: FenceStore = {
  async load(): Promise<QueuedFence[]> {
    try {
      const saved = fileOf('pending-fence.json');
      return saved.exists ? parseFences(JSON.parse(await saved.text())) : [];
    } catch {
      return [];
    }
  },
  async save(items) {
    await fileOf('pending-fence.json').write(JSON.stringify(items));
  },
};

interface SavedSites {
  readonly userId: string;
  readonly sites: readonly DutySiteRecord[];
}

/**
 * The sites being watched, kept so the fence task can name a site when the app is woken
 * with no screen: the region only carries the site's id.
 */
export async function writeFenceSites(userId: string, sites: readonly DutySiteRecord[]) {
  try {
    await fileOf('fence-sites.json').write(JSON.stringify({ userId, sites }));
  } catch {
    // The next refresh writes it again.
  }
}

export async function readFenceSites(userId: string): Promise<readonly DutySiteRecord[]> {
  try {
    const saved = fileOf('fence-sites.json');
    if (!saved.exists) return [];
    const raw = JSON.parse(await saved.text()) as Partial<SavedSites> | null;
    return raw?.userId === userId && Array.isArray(raw.sites) ? raw.sites : [];
  } catch {
    return [];
  }
}

async function readAllStates(): Promise<Record<string, unknown>> {
  try {
    const saved = fileOf('fence-state.json');
    const raw = saved.exists ? JSON.parse(await saved.text()) : null;
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function readFenceState(userId: string): Promise<FenceState> {
  const all = await readAllStates();
  return all[userId] ? parseState(all[userId]) : EMPTY_STATE;
}

/** Writes wait their turn, so two events woken at once never overwrite each other. */
let turn: Promise<unknown> = Promise.resolve();

/** Changes the person's remembered fence state; returns the new state. */
export function updateFenceState(
  userId: string,
  change: (state: FenceState) => FenceState,
): Promise<FenceState> {
  const run = turn.then(async () => {
    const all = await readAllStates();
    const next = change(all[userId] ? parseState(all[userId]) : EMPTY_STATE);
    try {
      await fileOf('fence-state.json').write(JSON.stringify({ ...all, [userId]: next }));
    } catch {
      // Kept for the next change.
    }
    return next;
  });
  turn = run.catch(() => undefined);
  return run;
}
