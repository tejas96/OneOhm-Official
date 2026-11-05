import { describe, expect, it } from 'vitest';
import { GAP, pageCountOf, pageFromParam, pageNumbers } from './page-numbers';

describe('pageNumbers', () => {
  it('shows every page of a short list', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the first pages together near the start', () => {
    expect(pageNumbers(1, 25)).toEqual([1, 2, 3, 4, 5, GAP, 25]);
    expect(pageNumbers(4, 25)).toEqual([1, 2, 3, 4, 5, GAP, 25]);
  });

  it('shows the pages around the current one in the middle', () => {
    expect(pageNumbers(10, 25)).toEqual([1, GAP, 9, 10, 11, GAP, 25]);
  });

  it('keeps the last pages together near the end', () => {
    expect(pageNumbers(22, 25)).toEqual([1, GAP, 21, 22, 23, 24, 25]);
    expect(pageNumbers(25, 25)).toEqual([1, GAP, 21, 22, 23, 24, 25]);
  });

  it('treats a page past either end as the nearest end', () => {
    expect(pageNumbers(99, 25)).toEqual(pageNumbers(25, 25));
    expect(pageNumbers(0, 25)).toEqual(pageNumbers(1, 25));
  });
});

describe('pageCountOf', () => {
  it('rounds up and never goes below one page', () => {
    expect(pageCountOf(0, 30)).toBe(1);
    expect(pageCountOf(30, 30)).toBe(1);
    expect(pageCountOf(31, 30)).toBe(2);
    expect(pageCountOf(733, 30)).toBe(25);
  });
});

describe('pageFromParam', () => {
  it('reads a page number and falls back to the first page', () => {
    expect(pageFromParam('3')).toBe(3);
    expect(pageFromParam(null)).toBe(1);
    expect(pageFromParam('0')).toBe(1);
    expect(pageFromParam('-2')).toBe(1);
    expect(pageFromParam('abc')).toBe(1);
  });
});
