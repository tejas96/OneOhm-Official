import type { QuotationPreviewInput } from '@oneohm/api-contracts';

/** The site facts the subsidy rules read, whether from a property or from a preview. */
export interface SiteFacts {
  readonly households: number | null;
  readonly meterInSocietyName: boolean | null;
  readonly subsidyClaimed: boolean;
  /** The state top-up (PRD 3.5) reads these; a fresh lead without a site has neither. */
  readonly lowIncomeHousehold?: boolean;
  readonly state?: string;
}

/**
 * A fresh lead quoted before any site is on record: the preview says what it knows
 * (households, meter name, earlier subsidy); anything unsaid counts as not known.
 */
export function siteFactsWithoutProperty(input: QuotationPreviewInput): SiteFacts {
  return {
    households: input.households ?? null,
    meterInSocietyName: input.meterInSocietyName ?? null,
    subsidyClaimed: input.subsidyClaimed ?? false,
  };
}
