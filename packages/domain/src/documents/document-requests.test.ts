import { describe, expect, it } from 'vitest';
import { customerCategoryFor, isCustomerRequestable } from './document-requests';
import { requiredDocuments } from './required-documents';

describe('isCustomerRequestable', () => {
  it('allows papers the customer holds', () => {
    expect(isCustomerRequestable('electricity_bill')).toBe(true);
    expect(isCustomerRequestable('customer_kyc')).toBe(true);
  });

  it('refuses files OneOhm makes or keeps internal', () => {
    expect(isCustomerRequestable('site_survey')).toBe(false);
    expect(isCustomerRequestable('vendor')).toBe(false);
    expect(isCustomerRequestable('statutory_report')).toBe(false);
  });
});

describe('customerCategoryFor', () => {
  const list = requiredDocuments({
    type: 'residential',
    loan: true,
    subsidy: true,
    nameChange: false,
  });
  const byKey = (key: string) => {
    const found = list.find((requirement) => requirement.key === key);
    if (!found) throw new Error(`No requirement ${key}`);
    return found;
  };

  it('asks the customer for their ID, bill and property proof', () => {
    expect(customerCategoryFor(byKey('kyc'))).toBe('customer_kyc');
    expect(customerCategoryFor(byKey('bill'))).toBe('electricity_bill');
    expect(customerCategoryFor(byKey('property'))).toBe('property');
  });

  it('asks for loan and subsidy bank papers', () => {
    expect(customerCategoryFor(byKey('loan'))).toBe('bank_loan');
    expect(customerCategoryFor(byKey('subsidy_bank'))).toBe('subsidy');
  });

  it('never asks the customer for papers OneOhm makes', () => {
    expect(customerCategoryFor(byKey('survey'))).toBeNull();
    expect(customerCategoryFor(byKey('net_metering'))).toBeNull();
    expect(customerCategoryFor(byKey('handover'))).toBeNull();
  });
});
