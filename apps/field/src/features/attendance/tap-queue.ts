import type { PositionInput } from '@oneohm/api-contracts';

/** A check-in or check-out tapped without signal, kept on the phone with its tap time (A9). */
export interface QueuedTap {
  /**
   * Who tapped. A tap is only ever sent while that person is signed in; taps of someone
   * else stay on the phone untouched. Empty for a tap saved before this was kept: it is
   * never sent, because nobody can say whose it is.
   */
  readonly userId: string;
  readonly kind: 'in' | 'out';
  readonly tappedAt: string;
  readonly position: PositionInput | null;
}

/** Anything kept per person with signal: attendance taps here, site fence events beside it. */
export interface QueuedItem {
  readonly userId: string;
}

export interface TapStore<T extends QueuedItem = QueuedTap> {
  load(): Promise<T[]>;
  save(items: readonly T[]): Promise<void>;
}

/** What to do with a failed send: try later, count it as done, or drop it with the reason. */
export type SendOutcome = 'retry' | 'done' | 'refused' | 'unauthorized';

/**
 * No signal, a timeout or a server hiccup keeps the tap; "already checked in/out" (409) means
 * an earlier send got through, so it is success, not an error; a 401 means the session ended,
 * so the run stops until the next sign-in or foreground; any other refusal is final.
 */
export function outcomeOf(error: unknown): SendOutcome {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return 'retry';
  if (status === 409) return 'done';
  if (status === 401) return 'unauthorized';
  if (status === 0 || status === 408 || status === 429 || status >= 500) return 'retry';
  return 'refused';
}

export function parseTaps(raw: unknown): QueuedTap[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): QueuedTap[] => {
    const tap = item as Partial<QueuedTap> | null;
    if (!tap || (tap.kind !== 'in' && tap.kind !== 'out') || typeof tap.tappedAt !== 'string')
      return [];
    return [
      {
        userId: typeof tap.userId === 'string' ? tap.userId : '',
        kind: tap.kind,
        tappedAt: tap.tappedAt,
        position: tap.position ?? null,
      },
    ];
  });
}

type Attempt = 'sent' | 'retry' | 'done' | 'unauthorized' | { readonly refused: unknown };

async function attempt<T extends QueuedItem>(
  send: (tap: T) => Promise<unknown>,
  tap: T,
): Promise<Attempt> {
  try {
    await send(tap);
    return 'sent';
  } catch (error) {
    const outcome = outcomeOf(error);
    return outcome === 'refused' ? { refused: error } : outcome;
  }
}

export interface RefusedTap<T extends QueuedItem = QueuedTap> {
  readonly tap: T;
  readonly error: unknown;
}

export interface FlushResult<T extends QueuedItem = QueuedTap> {
  readonly sent: number;
  readonly refused: readonly RefusedTap<T>[];
  /** The run ended on a 401: nothing is sent again until `resume`. */
  readonly unauthorized: boolean;
}

/**
 * Taps waiting for signal, oldest first. They are sent one at a time in order, only the
 * signed-in person's (others stay untouched); a flush that is already running is joined,
 * never doubled, so a tap is not sent twice. A 401 halts the queue, with no retry loop,
 * until `resume` (the next sign-in or the app coming to the front).
 */
export function createTapQueue<T extends QueuedItem = QueuedTap>(store: TapStore<T>) {
  let items: T[] = [];
  let loading: Promise<void> | null = null;
  let flushing: Promise<FlushResult<T>> | null = null;
  let flushingFor = '';
  const listeners = new Set<() => void>();
  const set = async (next: T[]) => {
    items = next;
    for (const listener of listeners) listener();
    await store.save(next).catch(() => undefined);
  };
  const load = () => {
    loading ??= store.load().then((saved) => {
      items = [...saved, ...items];
      for (const listener of listeners) listener();
    });
    return loading;
  };
  let halted = false;
  /** Sends the person's waiting taps in order until one is kept for later. */
  const drain = async (
    send: (tap: T) => Promise<unknown>,
    userId: string,
  ): Promise<FlushResult<T>> => {
    let sent = 0;
    const refused: RefusedTap<T>[] = [];
    if (halted) return { sent, refused, unauthorized: true };
    for (let tap = items.find((item) => item.userId === userId); tap; ) {
      const outcome = await attempt(send, tap);
      if (outcome === 'retry') break;
      if (outcome === 'unauthorized') {
        halted = true;
        return { sent, refused, unauthorized: true };
      }
      if (outcome === 'sent') sent += 1;
      else if (typeof outcome === 'object') refused.push({ tap, error: outcome.refused });
      // Taps added while this one was sending stay behind it.
      const done = tap;
      await set(items.filter((item) => item !== done));
      tap = items.find((item) => item.userId === userId);
    }
    return { sent, refused, unauthorized: false };
  };
  let mineOf: { from: readonly T[]; userId: string; list: readonly T[] } | null = null;
  return {
    load,
    /** Every kept tap, whoever's: the same list object until it changes. */
    get: (): readonly T[] => items,
    /** The person's own taps: the same list object until they change, for `useSyncExternalStore`. */
    mine(userId: string): readonly T[] {
      if (mineOf?.from === items && mineOf.userId === userId) return mineOf.list;
      mineOf = { from: items, userId, list: items.filter((item) => item.userId === userId) };
      return mineOf.list;
    },
    /** Lets the queue send again after a 401 (a new sign-in, or the app coming back). */
    resume() {
      halted = false;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async add(tap: T) {
      await load();
      await set([...items, tap]);
    },
    flush(send: (tap: T) => Promise<unknown>, userId: string): Promise<FlushResult<T>> {
      if (flushing && flushingFor === userId) return flushing;
      // Another person's run in progress finishes first, so two runs never overlap.
      const run = () => load().then(() => drain(send, userId));
      const next = flushing ? flushing.then(run, run) : run();
      flushing = next;
      flushingFor = userId;
      const clear = () => {
        if (flushing === next) flushing = null;
      };
      next.then(clear, clear);
      return next;
    },
  };
}

/** What the card should offer once taps waiting to send are counted in (A9). */
export function lastQueued(items: readonly QueuedTap[]): 'in' | 'out' | null {
  return items.at(-1)?.kind ?? null;
}
