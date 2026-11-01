import { describe, expect, it } from 'vitest';
import { missingEvidence } from './evidence';

describe('missingEvidence', () => {
  it('asks for a photo when the task needs one and none is attached', () => {
    expect(missingEvidence(['photo', 'checklist'], [])).toEqual(['photo']);
    expect(missingEvidence(['photo'], ['application/pdf'])).toEqual(['photo']);
  });

  it('is satisfied by any attached image', () => {
    expect(missingEvidence(['photo'], ['image/heic'])).toEqual([]);
    expect(missingEvidence(['photo', 'measurement'], ['application/pdf', 'image/jpeg'])).toEqual(
      [],
    );
  });

  it('does not block tasks that need no photo', () => {
    expect(missingEvidence(['document'], [])).toEqual([]);
    expect(missingEvidence([], [])).toEqual([]);
  });
});
