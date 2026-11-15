import { PlatformError } from '@oneohm/marketing';
import { describe, expect, it } from 'vitest';
import { NoLeadTaker } from '../crm/lead-intake.service';
import { type EventWork, handleOnce, PermanentEventError } from './event-flow';

/** A database whose transaction undoes the claims made in it when the work throws. */
function fakeDb(seen: string[] = []) {
  const keys = new Set(seen);
  return {
    keys,
    transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const before = new Set(keys);
      const tx = {
        insert: () => ({
          values: ({ key }: { key: string }) => ({
            onConflictDoNothing: () => ({
              returning: async () => {
                if (keys.has(key)) return [];
                keys.add(key);
                return [{ key }];
              },
            }),
          }),
        }),
      };
      try {
        return await work(tx);
      } catch (error) {
        keys.clear();
        for (const key of before) keys.add(key);
        throw error;
      }
    },
  };
}

type Ev = { key: string };
function work(over: Partial<EventWork<Ev, void>> = {}) {
  const log = { applied: [] as string[], gaveUp: [] as string[], errors: 0 };
  const base: EventWork<Ev, void> = {
    prepare: async () => undefined,
    apply: async (e) => {
      log.applied.push(e.key);
    },
    giveUp: async (e) => {
      log.gaveUp.push(e.key);
    },
    onError: () => {
      log.errors += 1;
    },
  };
  return { log, work: { ...base, ...over } };
}

describe('handling webhook events once', () => {
  it('skips an event handled before and runs each new one once', async () => {
    const db = fakeDb(['a']);
    const { log, work: w } = work();
    const result = await handleOnce([{ key: 'a' }, { key: 'b' }], db as never, w);
    expect(log.applied).toEqual(['b']);
    expect(result).toEqual({ handled: 1, skipped: 1, failed: 0 });
    expect((await handleOnce([{ key: 'b' }], db as never, w)).skipped).toBe(1);
    expect(log.applied).toEqual(['b']);
  });

  it('undoes the claim when the work fails, so the resend does it again', async () => {
    const db = fakeDb();
    let fail = true;
    const { log, work: w } = work({
      apply: async (e) => {
        if (e.key === 'bad' && fail) throw new Error('boom');
      },
    });
    const first = await handleOnce([{ key: 'bad' }, { key: 'ok' }], db as never, w);
    expect(first).toEqual({ handled: 1, skipped: 0, failed: 1 });
    expect(db.keys.has('bad')).toBe(false);
    expect(db.keys.has('ok')).toBe(true);
    expect(log.errors).toBe(1);
    fail = false;
    const retry = await handleOnce([{ key: 'bad' }, { key: 'ok' }], db as never, w);
    expect(retry).toEqual({ handled: 1, skipped: 1, failed: 0 });
  });

  it('fails (and retries) for a retryable Meta refusal or an unknown error', async () => {
    const db = fakeDb();
    const { work: w } = work({
      prepare: async () => {
        throw new PlatformError('temporary', 'Meta is busy.');
      },
    });
    expect((await handleOnce([{ key: 'x' }], db as never, w)).failed).toBe(1);
    expect(db.keys.size).toBe(0);
  });

  it('claims, alerts once and answers ok for a failure waiting cannot fix', async () => {
    const db = fakeDb();
    const refusal = work({
      prepare: async () => {
        throw new PlatformError('auth', 'Meta needs to be connected again.');
      },
    });
    expect(await handleOnce([{ key: 'p' }], db as never, refusal.work)).toEqual({
      handled: 1,
      skipped: 0,
      failed: 0,
    });
    expect(refusal.log.gaveUp).toEqual(['p']);
    expect(db.keys.has('p')).toBe(true);
    // The resend is skipped: no second alert.
    await handleOnce([{ key: 'p' }], db as never, refusal.work);
    expect(refusal.log.gaveUp).toEqual(['p']);
    expect(refusal.log.errors).toBe(2);
  });

  it('treats "not connected" and "nobody can take leads" as permanent', async () => {
    const reasons: string[] = [];
    const db = fakeDb();
    const w = work({
      prepare: async (e) => {
        if (e.key === 'n') throw new PermanentEventError('Meta is not connected');
      },
      apply: async () => {
        throw new NoLeadTaker();
      },
      giveUp: async (_e, reason) => {
        reasons.push(reason.kind);
      },
    });
    const result = await handleOnce([{ key: 'n' }, { key: 'l' }], db as never, w.work);
    expect(result.failed).toBe(0);
    expect(reasons).toEqual(['unreadable', 'nobody']);
  });

  it('fails when even the alert cannot be saved', async () => {
    const db = fakeDb();
    const w = work({
      prepare: async () => {
        throw new PermanentEventError('x');
      },
      giveUp: async () => {
        throw new Error('db down');
      },
    });
    expect(await handleOnce([{ key: 'z' }], db as never, w.work)).toMatchObject({ failed: 1 });
    expect(db.keys.has('z')).toBe(false);
    expect(w.log.errors).toBe(2);
  });
});
