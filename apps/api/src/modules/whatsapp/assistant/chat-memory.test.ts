import { describe, expect, it } from 'vitest';
import { keepPending, pendingMedia } from './media-intake';
import { recentRequest } from './problem-flow';

const minutes = (count: number) => count * 60_000;
const photo = (id: string, at: number) =>
  ({ type: 'image', id, mimeType: 'image/jpeg', fileName: null, at }) as const;

describe('what the chat remembers about files', () => {
  const now = minutes(1000);

  it('keeps photos waiting for an hour, six at most', () => {
    const pending = [
      photo('old', now - minutes(61)),
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => photo(`p${n}`, now - n)),
    ];
    const kept = pendingMedia({ pending }, now);
    expect(kept.map((item) => item.id)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(pendingMedia({}, now)).toEqual([]);
    expect(pendingMedia(null, now)).toEqual([]);
  });

  it('carries waiting photos into "Report a problem" and drops the rest', () => {
    expect(keepPending({ pending: [photo('p1', now)], raised: { id: 'r', at: now } }, now)).toEqual(
      {
        pending: [photo('p1', now)],
      },
    );
    expect(keepPending({ projectId: 'x' }, now)).toEqual({});
  });

  it('adds photos to a request raised in the last half hour', () => {
    expect(recentRequest({ raised: { id: 'r1', at: now - minutes(29) } }, now)?.id).toBe('r1');
    expect(recentRequest({ raised: { id: 'r1', at: now - minutes(31) } }, now)).toBeNull();
    expect(recentRequest({}, now)).toBeNull();
  });
});
