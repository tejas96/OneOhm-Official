import type { OnboardingSettings } from './settings';
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
 * What the system saves each month (kW × units per kW × tariff) and how many years the
 * price takes to pay back, rounded to the nearest half year.
 */
export function savingAndPayback(
  capacityWp: number,
  effectivePaise: number,
  settings: OnboardingSettings,
): { monthlySavingPaise: number; paybackYears: number } {
  const monthlySavingPaise = Math.round(
    (capacityWp / 1000) * settings.unitsPerKwMonth * settings.tariffPaisePerUnit,
  );
  if (monthlySavingPaise <= 0) return { monthlySavingPaise: 0, paybackYears: 0 };
  const years = effectivePaise / (monthlySavingPaise * 12);
  return { monthlySavingPaise, paybackYears: Math.round(years * 2) / 2 };
}
