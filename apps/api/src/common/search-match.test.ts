import { describe, expect, it } from 'vitest';
import { wordForms } from './search-match';

describe('search word forms', () => {
  it('reads a number of four or more digits as phone digits', () => {
    expect(wordForms('98765').digits).toBe('%98765%');
    expect(wordForms('+91-98765').digits).toBe('%9198765%');
    expect(wordForms('987').digits).toBeNull();
    expect(wordForms('patil').digits).toBeNull();
  });

  it('compares codes without their dashes, typed with or without them', () => {
    expect(wordForms('oh-2026-002').bare).toBe('%oh2026002%');
    expect(wordForms('rcpt/2026/0007').bare).toBe('%rcpt20260007%');
    expect(wordForms('oh2026').bare).toBe('%oh2026%');
    expect(wordForms('-').bare).toBeNull();
  });

  it('matches the word as written anywhere in the field', () => {
    expect(wordForms('miraj').like).toBe('%miraj%');
  });
});
