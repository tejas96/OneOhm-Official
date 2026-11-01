import type { QuotationPreviewInput } from '@oneohm/api-contracts';
import { calculateSubsidy, DEFAULT_SUBSIDY_RULES, ruleInForce } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { siteFactsWithoutProperty } from './site-facts';

const base: QuotationPreviewInput = {
  subsidyCategory: 'individual',
  systemType: 'on_grid',
  targetWp: 3000,
  panelProductId: '00000000-0000-4000-8000-000000000001',
  inverterProductId: '00000000-0000-4000-8000-000000000002',
  structureType: 'rcc_elevated',
  floors: 1,
  distanceKm: 5,
  discountPaise: 0,
};

/** The subsidy a property-less preview gets, through the same engine as any quotation. */
function subsidyFor(input: QuotationPreviewInput) {
  const site = siteFactsWithoutProperty(input);
  return calculateSubsidy(
    {
      category: input.subsidyCategory,
      capacityWp: input.targetWp,
      panelsDcr: true,
      systemType: input.systemType,
      households: input.households ?? site.households ?? undefined,
      meterInSocietyName: site.meterInSocietyName ?? undefined,
      propertyAlreadySubsidised: site.subsidyClaimed,
    },
    ruleInForce(DEFAULT_SUBSIDY_RULES, input.subsidyCategory, '2026-11-01'),
  );
}

describe('pricing a fresh lead without a site on record', () => {
  it('treats unsaid site facts as not known', () => {
    expect(siteFactsWithoutProperty(base)).toEqual({
      households: null,
      meterInSocietyName: null,
      subsidyClaimed: false,
    });
  });

  it('gives a 3 kW home the full PM Surya Ghar subsidy', () => {
    expect(subsidyFor(base).amountPaise).toBe(7_800_000);
  });

  it('respects what the preview says about the site', () => {
    expect(subsidyFor({ ...base, subsidyClaimed: true }).ineligible).toBe('already_subsidised');
    const society = {
      ...base,
      subsidyCategory: 'society' as const,
      households: 2,
      targetWp: 10_000,
    };
    expect(subsidyFor({ ...society, meterInSocietyName: false }).ineligible).toBe(
      'meter_not_in_society_name',
    );
    expect(subsidyFor(society).eligibleWp).toBe(6000);
  });
});
