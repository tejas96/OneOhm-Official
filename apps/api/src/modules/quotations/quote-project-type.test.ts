import { describe, expect, it } from 'vitest';
import { quoteProjectKind } from './quote-project-type';

describe('quoteProjectKind', () => {
  it('is the project type the quote becomes when accepted', () => {
    expect(
      quoteProjectKind({ subsidyCategory: 'individual', structureType: 'rcc_elevated' }),
    ).toEqual({ type: 'residential', groundMount: false });
    expect(
      quoteProjectKind({ subsidyCategory: 'commercial', structureType: 'ground_mount' }),
    ).toEqual({ type: 'commercial', groundMount: true });
  });
});
