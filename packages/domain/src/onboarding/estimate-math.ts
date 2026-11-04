import type { BillBand, OnboardingSettings } from './settings';
import type { OnboardAnswers } from './steps';

export type PricingInputs =
  | {
      readonly kind: 'priceable';
      readonly subsidyCategory: 'individual' | 'commercial';
      readonly structureType: 'rcc_elevated' | 'tin_shed';
      readonly floors: number;
      readonly targetWp: number;
    }
  | {
      readonly kind: 'expert';
      readonly reason: 'farm' | 'society' | 'roof_other' | 'large_bill' | 'missing';
    };

/**
 * What the pricing engine needs for these answers, or why an expert must price it.
 * A home is an individual, a business is commercial; farms, societies, other roofs and
 * the top bill band are never priced here, so no wrong number reaches a customer.
 */
export function pricingInputsFor(
  answers: OnboardAnswers,
  settings: OnboardingSettings,
): PricingInputs {
  const { site, roof, bill } = answers;
  if (site === 'farm' || site === 'society') return { kind: 'expert', reason: site };
  if (!site || !roof || !bill) return { kind: 'expert', reason: 'missing' };
  if (roof === 'other') return { kind: 'expert', reason: 'roof_other' };
  const band = settings.billBands.find((candidate) => candidate.id === bill);
  if (!band) return { kind: 'expert', reason: 'missing' };
  if (band.targetWp === null) return { kind: 'expert', reason: 'large_bill' };
  return {
    kind: 'priceable',
    subsidyCategory: site === 'business' ? 'commercial' : 'individual',
    structureType: roof === 'rcc' ? 'rcc_elevated' : 'tin_shed',
    floors: answers.floors ?? 1,
    targetWp: band.targetWp,
  };
}

/**
 * The most a month's bill in this band can be, in paise: its typed-amount limit, else the
 * last amount in its label ("₹2,000–2,500" → ₹2,500). Null for the open top band, and for
 * a last band with no limit: its label names its lower end ("Over ₹5,000").
 */
function bandCapPaise(bands: readonly BillBand[], id: string | undefined): number | null {
  const band = bands.find((candidate) => candidate.id === id);
  if (!band || band.maxRupees === null) return null;
  if (typeof band.maxRupees === 'number') return band.maxRupees * 100;
  if (band === bands.at(-1)) return null;
  const amounts = band.label.replaceAll(',', '').match(/\d+/g);
  const last = amounts?.at(-1);
  return last ? Number(last) * 100 : null;
}

/**
 * What the system saves each month (kW × units per kW × tariff) and how many years the
 * price takes to pay back, rounded to the nearest half year. The saving is never more
 * than the top of the customer's bill band (live review C2): nobody saves more than
 * they pay.
 */
export function savingAndPayback(
  capacityWp: number,
  effectivePaise: number,
  settings: OnboardingSettings,
  billBandId?: string,
): { monthlySavingPaise: number; paybackYears: number } {
  const made = Math.round(
    (capacityWp / 1000) * settings.unitsPerKwMonth * settings.tariffPaisePerUnit,
  );
  const cap = bandCapPaise(settings.billBands, billBandId);
  const monthlySavingPaise = cap === null ? made : Math.min(made, cap);
  if (monthlySavingPaise <= 0) return { monthlySavingPaise: 0, paybackYears: 0 };
  const years = effectivePaise / (monthlySavingPaise * 12);
  return { monthlySavingPaise, paybackYears: Math.round(years * 2) / 2 };
}
