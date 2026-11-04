import { describe, expect, it } from 'vitest';
import {
  askKeyOf,
  canAskCustomerFor,
  customerCategoryFor,
  isCustomerRequestable,
  nextActionStatus,
  sameAsk,
} from './customer-actions';
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

describe('canAskCustomerFor', () => {
  it('is true when one folder is a paper the customer holds', () => {
    expect(canAskCustomerFor(['site_photo', 'electricity_bill'])).toBe(true);
  });

  it('is false for the Other folder and folders OneOhm fills itself', () => {
    expect(canAskCustomerFor(['other'])).toBe(false);
    expect(canAskCustomerFor(['site_survey', 'statutory_report'])).toBe(false);
  });
});

describe('nextActionStatus', () => {
  it('a paper the customer sends waits for the check, then closes', () => {
    expect(nextActionStatus('paper', 'open', 'customer_did_it')).toBe('received');
    expect(nextActionStatus('paper', 'received', 'looks_good')).toBe('closed');
  });

  it('a paper staff file is checked at once', () => {
    expect(nextActionStatus('paper', 'open', 'staff_did_it')).toBe('closed');
  });

  it('a type with no check goes straight to closed', () => {
    expect(nextActionStatus('confirm', 'open', 'customer_did_it')).toBe('closed');
    expect(nextActionStatus('confirm', 'received', 'looks_good')).toBeNull();
  });

  it('ask again reopens a received or closed paper only', () => {
    expect(nextActionStatus('paper', 'received', 'ask_again')).toBe('open');
    expect(nextActionStatus('paper', 'closed', 'ask_again')).toBe('open');
    expect(nextActionStatus('paper', 'open', 'ask_again')).toBeNull();
    expect(nextActionStatus('paper', 'cancelled', 'ask_again')).toBeNull();
  });

  it('only an open action is cancelled or answered', () => {
    expect(nextActionStatus('paper', 'open', 'cancel')).toBe('cancelled');
    expect(nextActionStatus('paper', 'received', 'cancel')).toBeNull();
    expect(nextActionStatus('paper', 'closed', 'customer_did_it')).toBeNull();
  });
});

describe('asking the same paper twice', () => {
  const free = (title: string) => ({ category: 'customer_kyc', title });

  it('a free ask is keyed by its kind and words, so Aadhaar and PAN differ', () => {
    expect(askKeyOf(free('Aadhaar'))).not.toBe(askKeyOf(free('PAN')));
    expect(askKeyOf(free(' aadhaar! '))).toBe(askKeyOf(free('Aadhaar')));
  });

  it('a checklist item brings its own key', () => {
    expect(askKeyOf({ requirementKey: 'kyc', category: 'customer_kyc', title: 'ID' })).toBe('kyc');
  });

  it('is the same when both keys match, different when they do not', () => {
    const a = { requirementKey: 'free:customer_kyc:aadhaar', category: 'customer_kyc' };
    expect(sameAsk(a, { ...a })).toBe(true);
    expect(sameAsk(a, { requirementKey: 'free:customer_kyc:pan', category: 'customer_kyc' })).toBe(
      false,
    );
  });

  it('falls back to the kind when either has no key (older rows)', () => {
    const keyed = { requirementKey: 'kyc', category: 'customer_kyc' };
    expect(sameAsk(keyed, { requirementKey: null, category: 'customer_kyc' })).toBe(true);
    expect(sameAsk(keyed, { requirementKey: null, category: 'electricity_bill' })).toBe(false);
  });
});
