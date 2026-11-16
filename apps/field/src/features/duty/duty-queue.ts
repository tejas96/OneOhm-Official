import type { DutyPointRejection } from '@oneohm/domain';
import { outcomeOf } from '../attendance/tap-queue';
import type { DutyPoint } from './duty-point';
import { BATCH_MAX, QUEUE_CAP } from './duty-settings';

/** One person's points waiting for signal, and how many were dropped to keep the cap. */
export interface DutyState {
  readonly points: readonly DutyPoint[];
  readonly dropped: number;
}

/** One file per person, so a second person on the phone never sees or sends the first's route. */
export interface DutyStore {
  load(userId: string): Promise<DutyState>;
  save(userId: string, state: DutyState): Promise<void>;
}

export interface UploadAnswer {
  readonly accepted: number;
  readonly rejected: readonly { readonly id: string; readonly reason: DutyPointRejection }[];
}

export function parseDutyState(raw: unknown): DutyState {
  const saved = raw as { points?: unknown; dropped?: unknown } | null;
  const points = Array.isArray(saved?.points)
    ? saved.points.filter(
        (item): item is DutyPoint =>
          typeof item?.id === 'string' &&
          typeof item.recordedAt === 'string' &&
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number',
      )
    : [];
  return { points, dropped: typeof saved?.dropped === 'number' ? saved.dropped : 0 };
}

/** One batch sent: the answer, or why it was not taken (a 4xx is final for that batch). */
async function attempt(
  send: (points: readonly DutyPoint[]) => Promise<UploadAnswer>,
  batch: readonly DutyPoint[],
): Promise<UploadAnswer | 'retry' | 'unauthorized' | 'refused'> {
  try {
    return await send(batch);
  } catch (error) {
    const outcome = outcomeOf(error);
    return outcome === 'unauthorized' || outcome === 'retry' ? outcome : 'refused';
  }
}

function tally(
  total: { sent: number; reasons: Set<DutyPointRejection> },
  answer: UploadAnswer,
): void {
  total.sent += answer.accepted;
  for (const item of answer.rejected) total.reasons.add(item.reason);
}

export interface DutyFlush {
  readonly sent: number;
  /** Why the server turned points away, once each: the phone reacts to some (no consent). */
  readonly reasons: readonly DutyPointRejection[];
  /** Left for later: no signal or a server hiccup. */
  readonly stalled: boolean;
  /** The run ended on a 401: nothing is sent again until `resume`. */
  readonly unauthorized: boolean;
}

/**
 * Route points waiting to upload, oldest first, per person. Points go in batches of at most
 * 200; a batch the server answered (accepted or rejected, both final) leaves the queue, one
 * that met no signal stays, and a 401 halts that person's run until `resume`, as the tap queue does. A batch refused with
 * a 400 is split in halves until the bad point is found and dropped.
 * A flush already running for a person is joined, so a point is never sent twice at once.
 */
export function createDutyQueue(store: DutyStore) {
  const states = new Map<string, DutyState>();
  const loading = new Map<string, Promise<void>>();
  const flushing = new Map<string, Promise<DutyFlush>>();
  const listeners = new Set<() => void>();
  /** People whose last upload ended on a 401: each is halted on their own. */
  const halted = new Set<string>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const stateOf = (userId: string): DutyState => states.get(userId) ?? { points: [], dropped: 0 };
  const set = async (userId: string, next: DutyState) => {
    states.set(userId, next);
    notify();
    await store.save(userId, next).catch(() => undefined);
  };
  const load = (userId: string) => {
    const pending = loading.get(userId);
    if (pending) return pending;
    const started = store.load(userId).then((saved) => {
      const live = stateOf(userId);
      states.set(userId, {
        points: [...saved.points, ...live.points],
        dropped: saved.dropped + live.dropped,
      });
      notify();
    });
    loading.set(userId, started);
    return started;
  };
  const next = (userId: string) => stateOf(userId).points.slice(0, BATCH_MAX);
  /** Takes a finished batch out; points added while it was sending stay behind it. */
  const remove = async (userId: string, batch: readonly DutyPoint[]) => {
    const gone = new Set(batch.map((point) => point.id));
    const now = stateOf(userId);
    const left = now.points.filter((point) => !gone.has(point.id));
    await set(userId, { points: left, dropped: left.length ? now.dropped : 0 });
  };
  type Send = (points: readonly DutyPoint[]) => Promise<UploadAnswer>;
  type Total = { sent: number; reasons: Set<DutyPointRejection> };
  /**
   * Sends a batch. One the server refuses outright (a 400: the body is malformed, which only
   * a bad point can cause, as the server judges the rest point by point) is split in halves
   * to find the bad point; a single refused point is dropped, the rest go on.
   */
  const deliver = async (
    send: Send,
    userId: string,
    total: Total,
    batch: readonly DutyPoint[],
  ): Promise<'done' | 'retry' | 'halt'> => {
    const outcome = await attempt(send, batch);
    if (outcome === 'unauthorized') {
      halted.add(userId);
      return 'halt';
    }
    if (outcome === 'retry') return outcome;
    if (outcome === 'refused' && batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      for (const half of [batch.slice(0, middle), batch.slice(middle)]) {
        const result = await deliver(send, userId, total, half);
        if (result !== 'done') return result;
      }
      return 'done';
    }
    if (outcome !== 'refused') tally(total, outcome);
    await remove(userId, batch);
    return 'done';
  };
  const drain = async (send: Send, userId: string): Promise<DutyFlush> => {
    const total: Total = { sent: 0, reasons: new Set() };
    const finish = (stalled: boolean, unauthorized = false): DutyFlush => ({
      sent: total.sent,
      reasons: [...total.reasons],
      stalled,
      unauthorized,
    });
    if (halted.has(userId)) return finish(false, true);
    for (let batch = next(userId); batch.length > 0; batch = next(userId)) {
      const result = await deliver(send, userId, total, batch);
      if (result === 'halt') return finish(false, true);
      if (result === 'retry') return finish(true);
    }
    return finish(false);
  };
  return {
    load,
    /** How many of the person's points are waiting: a number, so it suits `useSyncExternalStore`. */
    waiting: (userId: string): number => stateOf(userId).points.length,
    /** How many were dropped for the cap; counted until the queue is empty again. */
    dropped: (userId: string): number => stateOf(userId).dropped,
    /** Lets a halted person upload again (after signing in); with no one named, everyone. */
    resume(userId?: string) {
      if (userId) halted.delete(userId);
      else halted.clear();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async add(userId: string, points: readonly DutyPoint[]) {
      await load(userId);
      const now = stateOf(userId);
      const all = [...now.points, ...points];
      const over = Math.max(0, all.length - QUEUE_CAP);
      await set(userId, { points: all.slice(over), dropped: now.dropped + over });
    },
    flush(
      send: (points: readonly DutyPoint[]) => Promise<UploadAnswer>,
      userId: string,
    ): Promise<DutyFlush> {
      const running = flushing.get(userId);
      if (running) return running;
      const next = load(userId).then(() => drain(send, userId));
      flushing.set(userId, next);
      const clear = () => {
        if (flushing.get(userId) === next) flushing.delete(userId);
      };
      next.then(clear, clear);
      return next;
    },
  };
}
