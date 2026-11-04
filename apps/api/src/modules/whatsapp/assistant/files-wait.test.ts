import { describe, expect, it } from 'vitest';
import {
  asked,
  filedBatchesOf,
  filesWaitOf,
  isDue,
  isOldQuestion,
  readWhatTap,
  readWhereTap,
  withBatch,
  withFile,
  withoutFiles,
} from './files-wait';

const now = Date.UTC(2026, 10, 5, 10);
const file = (id: string, at = now) => ({ id, media: `m-${id}`, type: 'image' as const, at });
const UUID = '11111111-1111-4111-8111-111111111111';

describe('files waiting for "What is this?"', () => {
  it('keeps nothing for a chat with no waiting files', () => {
    expect(filesWaitOf({})).toBeNull();
    expect(filesWaitOf(null)).toBeNull();
    expect(filesWaitOf({ filesWait: null })).toBeNull();
  });

  it('collects a burst and asks once, 15 seconds after the last file', () => {
    const first = withFile({}, file('a'), now, 15);
    expect(first.askAt).toBe(now + 15_000);
    expect(isDue(first, now + 14_000)).toBe(false);
    const second = withFile({ filesWait: first }, file('b', now + 10_000), now + 10_000, 15);
    expect(second.files.map((one) => one.id)).toEqual(['a', 'b']);
    // The wait starts again from the last file.
    expect(second.askAt).toBe(now + 25_000);
    expect(isDue(second, now + 20_000)).toBe(false);
    expect(isDue(second, now + 25_000)).toBe(true);
  });

  it('counts a retried file once and never drops a file', () => {
    let wait = withFile({}, file('a'), now, 15);
    wait = withFile({ filesWait: wait }, file('a'), now, 15);
    expect(wait.files).toHaveLength(1);
    for (let n = 0; n < 12; n += 1) wait = withFile({ filesWait: wait }, file(`f${n}`), now, 15);
    expect(wait.files).toHaveLength(13);
    expect(wait.files.at(-1)?.id).toBe('f11');
  });

  it('a late file waits for its own question and leaves the open one alone', () => {
    const before = asked(withFile({}, file('a'), now, 15), now + 15_000, {
      focus: ['a'],
      offered: 'x',
      each: { of: 1 },
    });
    expect(before.askAt).toBeNull();
    const after = withFile({ filesWait: before }, file('b', now + 20_000), now + 20_000, 15);
    expect(after).toMatchObject({ focus: ['a'], each: true, offered: 'x', askAt: now + 35_000 });
  });

  it('asking about some files keeps the time of a file that came meanwhile', () => {
    const wait = withFile({}, file('a'), now, 15);
    // A tap at `now` while the late file's question is still in the future.
    expect(asked(wait, now, { focus: ['a'], offered: null }).askAt).toBe(now + 15_000);
    // The timer's own question (due) uses the time up.
    expect(asked(wait, now + 20_000, { focus: ['a'], offered: null }).askAt).toBeNull();
  });

  it('drops filed files and ends when none are left', () => {
    const one = withFile({}, file('a'), now, 15);
    const wait = withFile({ filesWait: one }, file('b'), now, 15);
    expect(withoutFiles(wait, ['a'])?.files.map((entry) => entry.id)).toEqual(['b']);
    expect(withoutFiles(wait, ['a', 'b'])).toBeNull();
  });

  it('calls a question old after 24 hours', () => {
    const wait = asked(withFile({}, file('a'), now, 15), now, { focus: null, offered: null });
    expect(isOldQuestion(wait, now + 23 * 3_600_000)).toBe(false);
    expect(isOldQuestion(wait, now + 25 * 3_600_000)).toBe(true);
  });

  it('reads the taps of the question and the home list', () => {
    expect(readWhatTap('what:yes')).toEqual({ t: 'yes' });
    expect(readWhatTap('what:diff')).toEqual({ t: 'diff' });
    expect(readWhatTap(`what:a:${UUID}`)).toEqual({ t: 'a', actionId: UUID });
    expect(readWhatTap(`what:i:${UUID}:bill`)).toEqual({ t: 'i', key: 'bill', propertyId: UUID });
    expect(readWhatTap('what:i:person:kyc')).toEqual({ t: 'i', key: 'kyc', propertyId: null });
    expect(readWhatTap(`what:change:${UUID}`)).toEqual({ t: 'change', first: UUID });
    expect(readWhatTap('what:nonsense')).toBeNull();
    expect(readWhatTap('menu')).toBeNull();
    expect(readWhereTap(`where:${UUID}`)).toBe(UUID);
    expect(readWhereTap('where:x')).toBeNull();
  });

  it('keeps saved papers changeable for a day, five batches at most', () => {
    let context: Record<string, unknown> = {};
    for (let n = 0; n < 7; n += 1)
      context = { filedBatches: withBatch(context, [`d${n}`], now + n) };
    expect(filedBatchesOf(context, now + 10).map((batch) => batch.ids[0])).toEqual([
      'd2',
      'd3',
      'd4',
      'd5',
      'd6',
    ]);
    expect(filedBatchesOf(context, now + 25 * 3_600_000)).toEqual([]);
  });
});
