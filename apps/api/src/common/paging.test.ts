import { describe, expect, it } from 'vitest';
import { likeTerm, offsetOf, pageFrom, searchWords, slicePage } from './paging';

describe('paging', () => {
  it('starts at the cursor, or at the top without one', () => {
    expect(offsetOf({})).toBe(0);
    expect(offsetOf({ cursor: '60' })).toBe(60);
  });

  it('gives a next cursor only while rows remain', () => {
    expect(pageFrom([1, 2, 3], 10, 0, 3).nextCursor).toBe('3');
    expect(pageFrom([10], 10, 9, 3).nextCursor).toBeNull();
    expect(pageFrom([7, 8, 9], 9, 6, 3).nextCursor).toBeNull();
  });

  it('cuts a computed list into pages that meet without gaps', () => {
    const all = Array.from({ length: 7 }, (_, index) => index);
    const first = slicePage(all, { limit: 3 });
    const second = slicePage(all, { limit: 3, cursor: first.nextCursor ?? undefined });
    const third = slicePage(all, { limit: 3, cursor: second.nextCursor ?? undefined });
    expect([...first.items, ...second.items, ...third.items]).toEqual(all);
    expect(third.nextCursor).toBeNull();
    expect(first.total).toBe(7);
  });

  it('takes % and _ in a search literally', () => {
    expect(likeTerm('50%_off')).toBe('%50\\%\\_off%');
  });

  it('splits a search into lower-case words', () => {
    expect(searchWords('  Patil   MIRAJ ')).toEqual(['patil', 'miraj']);
    expect(searchWords(undefined)).toEqual([]);
  });
});
