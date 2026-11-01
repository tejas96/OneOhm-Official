import type { QuotationPreview } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { createQuotation, newCustomer, type QuoteOptions, quoteInput } from '../support/sales';

// PRD 13 "Subsidy": correct subsidy for individual, housing society and commercial cases;
// ₹0 with a reason for non-DCR panels. Expected amounts are worked out here from the PM
// Surya Ghar rules (PRD 3.5), independently of the domain code.
const RUPEE = 100;

/** Individual home: ₹30,000/kW up to 2 kW, ₹18,000/kW for the 3rd kW, at most ₹78,000. */
function individualSubsidy(capacityWp: number): number {
  const first = Math.min(capacityWp, 2000);
  const third = Math.max(0, Math.min(capacityWp, 3000) - 2000);
  const amount =
    Math.round((first / 1000) * 30_000 * RUPEE) + Math.round((third / 1000) * 18_000 * RUPEE);
  return Math.min(amount, 78_000 * RUPEE);
}

/** Housing society: ₹18,000/kW on at most 3 kW per household (and 500 kW in all). */
function societySubsidy(capacityWp: number, households: number): number {
  const eligibleWp = Math.min(capacityWp, households * 3000, 500_000);
  return Math.round((eligibleWp / 1000) * 18_000 * RUPEE);
}

describe('Subsidy', () => {
  let admin: Session;
  const preview = async (options: QuoteOptions & { meterInSocietyName?: boolean }) =>
    admin.post<QuotationPreview>('/quotations/preview', {
      ...(await quoteInput(admin, options)),
      propertyId: null,
      ...(options.meterInSocietyName === undefined
        ? {}
        : { meterInSocietyName: options.meterInSocietyName }),
    });

  beforeAll(async () => {
    admin = await Session.admin();
  });

  it.each([
    [1000, 'inverter3k'],
    [2000, 'inverter3k'],
    [3000, 'inverter3k'],
    [5000, 'inverter5k'],
  ] as const)(
    'individual home, %i W asked: PM Surya Ghar amount on the quoted capacity',
    async (targetWp, inverter) => {
      const result = await preview({ targetWp, inverter });
      const { capacityWp, subsidyPaise, subsidyIneligible } = result.totals;
      expect(subsidyIneligible).toBeNull();
      expect(subsidyPaise).toBe(individualSubsidy(capacityWp));
      expect(result.totals.effectivePaise).toBe(result.totals.totalPaise - subsidyPaise);
    },
  );

  it('caps an individual home at ₹78,000 from 3 kW up', async () => {
    const five = await preview({ targetWp: 5000, inverter: 'inverter5k' });
    expect(five.totals.subsidyPaise).toBe(78_000 * RUPEE);
  });

  it('a saved individual quotation carries the same subsidy as the instant preview', async () => {
    const customer = await newCustomer(admin, { name: 'Subsidy Home Customer (test)' });
    const quotation = await createQuotation(admin, customer, { targetWp: 2000 });
    expect(quotation.totals.subsidyIneligible).toBeNull();
    expect(quotation.subsidyPaise).toBe(individualSubsidy(quotation.totals.capacityWp));
    expect(quotation.effectivePaise).toBe(quotation.totalPaise - quotation.subsidyPaise);
  });

  it('housing society: ₹18,000 per kW, limited to 3 kW per household', async () => {
    const options = {
      category: 'society',
      targetWp: 10_000,
      inverter: 'inverter10k',
    } as const;
    const few = await newCustomer(admin, {
      name: 'Shanti Nagar CHS (test)',
      category: 'society',
      households: 2,
    });
    const capped = await createQuotation(admin, few, { ...options, households: 2 });
    expect(capped.totals.subsidyIneligible).toBeNull();
    expect(capped.subsidyPaise).toBe(societySubsidy(capped.totals.capacityWp, 2));
    expect(capped.subsidyPaise).toBe(6 * 18_000 * RUPEE);

    const many = await newCustomer(admin, {
      name: 'Gulmohar Apartments CHS (test)',
      category: 'society',
      households: 10,
    });
    const full = await createQuotation(admin, many, { ...options, households: 10 });
    expect(full.subsidyPaise).toBe(societySubsidy(full.totals.capacityWp, 10));
    expect(full.subsidyPaise).toBeGreaterThan(capped.subsidyPaise);
  });

  it('housing society whose meter is not in its own name gets ₹0 with the reason', async () => {
    const result = await preview({
      category: 'society',
      households: 10,
      targetWp: 10_000,
      inverter: 'inverter10k',
      meterInSocietyName: false,
    });
    expect(result.totals.subsidyPaise).toBe(0);
    expect(result.totals.subsidyIneligible).toBe('meter_not_in_society_name');
  });

  it('commercial site: ₹0 with the reason "commercial"', async () => {
    const shop = await newCustomer(admin, {
      name: 'Krishna Traders (test)',
      category: 'commercial',
    });
    const quotation = await createQuotation(admin, shop, {
      category: 'commercial',
      targetWp: 10_000,
      inverter: 'inverter10k',
    });
    expect(quotation.subsidyPaise).toBe(0);
    expect(quotation.totals.subsidyIneligible).toBe('commercial');
    expect(quotation.effectivePaise).toBe(quotation.totalPaise);
  });

  it('non-DCR panels: ₹0 with the reason, shown beside the DCR option', async () => {
    const nonDcr = await preview({ targetWp: 3000, panel: 'nonDcr' });
    expect(nonDcr.totals.subsidyPaise).toBe(0);
    expect(nonDcr.totals.subsidyIneligible).toBe('non_dcr_panels');
    expect(nonDcr.comparison?.dcr.subsidyPaise).toBeGreaterThan(0);
    expect(nonDcr.comparison?.nonDcr.subsidyIneligible).toBe('non_dcr_panels');

    const customer = await newCustomer(admin, { name: 'Non DCR Customer (test)' });
    const saved = await createQuotation(admin, customer, { targetWp: 3000, panel: 'nonDcr' });
    expect(saved.subsidyPaise).toBe(0);
    expect(saved.totals.subsidyIneligible).toBe('non_dcr_panels');
  });
});
