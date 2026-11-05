import { describe, expect, it } from 'vitest';
import {
  agreeTap,
  installBadTap,
  isJourneyTap,
  notYetTap,
  packTap,
  readJourneyTap,
  readyNowTap,
  showTap,
} from './journey-taps';

const ID = '0b5d3c5e-4b6a-4a4e-9d59-7c1f0a0f9e11';

describe('journey taps', () => {
  it('reads the id of each button back to its action', () => {
    expect(readJourneyTap(agreeTap(ID))).toEqual({ t: 'agree', id: ID });
    expect(readJourneyTap(notYetTap(ID))).toEqual({ t: 'notYet', id: ID });
    expect(readJourneyTap(readyNowTap(ID))).toEqual({ t: 'readyNow', id: ID });
    expect(readJourneyTap(installBadTap(ID))).toEqual({ t: 'installBad', id: ID });
    expect(readJourneyTap(packTap(ID))).toEqual({ t: 'pack', id: ID });
    expect(readJourneyTap(showTap(ID))).toEqual({ t: 'show', id: ID });
  });

  it('knows nothing else', () => {
    expect(readJourneyTap(null)).toBeNull();
    expect(readJourneyTap('go:payments')).toBeNull();
    expect(readJourneyTap('sgn:ok:not-an-id')).toBeNull();
    expect(isJourneyTap(`rdy:y:${ID}`)).toBe(true);
    expect(isJourneyTap(`vask:${ID}`)).toBe(false);
  });
});
