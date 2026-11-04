import { describe, expect, it } from 'vitest';
import { hasUnsaved } from './card-draft';

describe('hasUnsaved', () => {
  const saved = { goodsTaxBp: 500, pricing: { mode: 'rates', marginBp: 2000 }, jobItems: [1, 2] };

  it('is false for a copy, whatever the key order', () => {
    expect(
      hasUnsaved(
        { jobItems: [1, 2], pricing: { marginBp: 2000, mode: 'rates' }, goodsTaxBp: 500 },
        saved,
      ),
    ).toBe(false);
  });

  it('is true when any value changed, however deep', () => {
    expect(hasUnsaved({ ...saved, pricing: { mode: 'rates', marginBp: 2500 } }, saved)).toBe(true);
    expect(hasUnsaved({ ...saved, jobItems: [1] }, saved)).toBe(true);
  });
});
