/** A rooftop needs about this much shadow-free area per kWp when Settings has no figure. */
export const DEFAULT_SQM_PER_KWP = 10;

export interface RoofFit {
  readonly areaSqm: number;
  readonly sqmPerKwp: number;
  /** Area the quoted system needs. */
  readonly neededSqm: number;
  /** The largest system, in whole panels, the area holds. */
  readonly fitsWp: number;
  readonly fits: boolean;
}

/**
 * Survey-linked capacity (PRD 3.5): does the measured shadow-free area hold the quoted
 * size at the configured m² per kWp? Null when the check is switched off (0) or nothing
 * was measured.
 */
export function roofFit(input: {
  readonly capacityWp: number;
  readonly areaSqm: number | null;
  readonly sqmPerKwp: number;
  readonly panelWp: number;
}): RoofFit | null {
  const { capacityWp, areaSqm, sqmPerKwp, panelWp } = input;
  if (areaSqm === null || areaSqm <= 0 || sqmPerKwp <= 0) return null;
  const maxWp = (areaSqm / sqmPerKwp) * 1000;
  // A hair of slack so 30 m² at 10 m²/kWp still holds exactly 3 kWp.
  const fitsWp =
    panelWp > 0 ? Math.floor(maxWp / panelWp + 1e-9) * panelWp : Math.floor(maxWp + 1e-9);
  return {
    areaSqm,
    sqmPerKwp,
    neededSqm: Math.round((capacityWp / 1000) * sqmPerKwp * 10) / 10,
    fitsWp,
    fits: capacityWp <= fitsWp,
  };
}
