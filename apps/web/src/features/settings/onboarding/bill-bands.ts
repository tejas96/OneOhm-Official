import type { OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { MAX_BILL_BANDS, MIN_BILL_BANDS } from '@oneohm/domain';

export type Bands = OnboardingSettingsRecord['billBands'];

export const canAddBand = (bands: Bands) => bands.length < MAX_BILL_BANDS;
export const canRemoveBand = (bands: Bands) => bands.length > MIN_BILL_BANDS;

/**
 * A blank choice to fill in. Only the last choice may have no upper limit, so the new one
 * goes above an open-ended last choice and at the end otherwise.
 */
export function addBand(bands: Bands, id: string): Bands {
  if (!canAddBand(bands)) return bands;
  const fresh = { id, label: '', targetWp: null, maxRupees: null };
  const last = bands[bands.length - 1];
  if (last && last.maxRupees === null) return [...bands.slice(0, -1), fresh, last];
  return [...bands, fresh];
}

export function removeBand(bands: Bands, index: number): Bands {
  return canRemoveBand(bands) ? bands.filter((_, at) => at !== index) : bands;
}
