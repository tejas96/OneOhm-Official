import { describe, expect, it } from 'vitest';
import { countsForSite, isPersonDocumentCategory, isSiteDocumentCategory } from './site-papers';

const siteA = { propertyId: 'A', projectId: 'PA', customerSites: 2 };

describe('Site papers', () => {
  it('counts ID papers for every site of the customer', () => {
    const kyc = { category: 'customer_kyc', propertyId: 'B', projectId: 'PB' };
    expect(countsForSite(kyc, siteA)).toBe(true);
  });

  it('counts a bill only on its own site or project', () => {
    expect(
      countsForSite({ category: 'electricity_bill', propertyId: 'A', projectId: null }, siteA),
    ).toBe(true);
    expect(
      countsForSite({ category: 'electricity_bill', propertyId: null, projectId: 'PA' }, siteA),
    ).toBe(true);
    expect(
      countsForSite({ category: 'electricity_bill', propertyId: 'B', projectId: 'PB' }, siteA),
    ).toBe(false);
    expect(countsForSite({ category: 'property', propertyId: null, projectId: 'PB' }, siteA)).toBe(
      false,
    );
  });

  it('counts a bill filed with no site only when the customer has one site', () => {
    const loose = { category: 'property', propertyId: null, projectId: null };
    expect(countsForSite(loose, siteA)).toBe(false);
    expect(countsForSite(loose, { ...siteA, customerSites: 1 })).toBe(true);
  });

  it('shares only ID and income papers across homes', () => {
    expect(['customer_kyc', 'income_proof'].every(isPersonDocumentCategory)).toBe(true);
    for (const category of ['site_photo', 'discom', 'warranty', 'subsidy', 'bank_loan']) {
      expect(isSiteDocumentCategory(category)).toBe(true);
      expect(isPersonDocumentCategory(category)).toBe(false);
      expect(
        countsForSite(
          { category, propertyId: 'A', projectId: 'PA' },
          { ...siteA, propertyId: 'B', projectId: 'PB' },
        ),
      ).toBe(false);
    }
  });

  it('counts income proof for every home', () => {
    const proof = { category: 'income_proof', propertyId: 'B', projectId: 'PB' };
    expect(countsForSite(proof, siteA)).toBe(true);
  });
});
