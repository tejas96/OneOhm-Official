import { describe, expect, it } from 'vitest';
import { readVisitCheckTap, visitCheckTaps } from './visit-check-taps';
import { VISIT_NEWS_LISTS } from './visit-news-words';

const ID = '7d3c2a10-1111-4abc-8def-0123456789ab';

describe('the visit check taps', () => {
  it('reads back what it writes', () => {
    expect(readVisitCheckTap(visitCheckTaps.yes(ID))).toEqual({ siteVisitId: ID, said: 'yes' });
    expect(readVisitCheckTap(visitCheckTaps.no(ID))).toEqual({ siteVisitId: ID, said: 'no' });
  });

  it('refuses anything else', () => {
    for (const id of [null, '', 'vc:y:', `vc:x:${ID}`, `vc:y:${ID}x`, `vcf:${ID}`])
      expect(readVisitCheckTap(id)).toBeNull();
  });

  it('keeps every button title within 20 characters', () => {
    for (const words of Object.values(VISIT_NEWS_LISTS))
      for (const title of [words.yes, words.no, words.track])
        expect([...title].length).toBeLessThanOrEqual(20);
  });
});
