import { describe, expect, it } from 'vitest';
import { roofFit } from './roof-fit';

describe('roofFit', () => {
  it('fits a system the area holds, to the whole panel', () => {
    expect(roofFit({ capacityWp: 3_000, areaSqm: 30, sqmPerKwp: 10, panelWp: 500 })).toEqual({
      areaSqm: 30,
      sqmPerKwp: 10,
      neededSqm: 30,
      fitsWp: 3_000,
      fits: true,
    });
  });

  it('flags a quoted size the shadow-free area cannot hold', () => {
    const fit = roofFit({ capacityWp: 5_400, areaSqm: 40, sqmPerKwp: 10, panelWp: 540 });
    expect(fit?.fits).toBe(false);
    expect(fit?.fitsWp).toBe(3_780);
    expect(fit?.neededSqm).toBe(54);
  });

  it('is off without a measurement or with 0 m² per kWp', () => {
    expect(roofFit({ capacityWp: 3_000, areaSqm: null, sqmPerKwp: 10, panelWp: 500 })).toBeNull();
    expect(roofFit({ capacityWp: 3_000, areaSqm: 20, sqmPerKwp: 0, panelWp: 500 })).toBeNull();
  });
});
