import { describe, expect, it } from 'vitest';
import type { Draft } from './complaint-start';
import { MAX_FILES, PROMPT_GAP_MS, withFile } from './problem-file';

const now = 1_000_000;
const draft = (extra: Partial<Draft> = {}): Draft => ({
  stage: 'extra',
  kind: 'inverter',
  since: 'today',
  ...extra,
});

describe('a file added to the report draft', () => {
  it('asks for the first file and saves the next ones of a burst quietly', () => {
    const first = withFile(draft({ promptedAt: now - 500 }), 'a', now);
    expect(first?.ask).toBe(true);
    const second = withFile({ ...first?.draft, ...{ promptedAt: now } } as Draft, 'b', now + 100);
    expect(second?.ask).toBe(false);
    expect(second?.draft.files).toEqual(['a', 'b']);
  });

  it('asks again when the last question is older than the gap', () => {
    const old = draft({ files: ['a'], promptedAt: now - PROMPT_GAP_MS - 1 });
    expect(withFile(old, 'b', now)?.ask).toBe(true);
    expect(withFile(draft({ files: ['a'] }), 'b', now)?.ask).toBe(true);
  });

  it('keeps each file once and no more than the cap', () => {
    expect(withFile(draft({ files: ['a'] }), 'a', now)).toBeNull();
    const full = draft({ files: ['a', 'b', 'c'].slice(0, MAX_FILES) });
    expect(withFile(full, 'd', now)).toBeNull();
  });
});
