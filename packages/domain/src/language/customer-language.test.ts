import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_LANGUAGES,
  customerLanguage,
  isCustomerLanguage,
  LANGUAGE_NAMES,
  settleLanguage,
} from './customer-language';

describe('customer language (PRD 5.1)', () => {
  it('reads stored values as a supported language, English otherwise', () => {
    expect(customerLanguage('mr-IN')).toBe('mr-IN');
    expect(customerLanguage('mr')).toBe('mr-IN');
    expect(customerLanguage('HI_in')).toBe('hi-IN');
    expect(customerLanguage(' en-GB ')).toBe('en-IN');
    expect(customerLanguage('ta-IN')).toBe('en-IN');
    expect(customerLanguage('')).toBe('en-IN');
    expect(customerLanguage(null)).toBe('en-IN');
    expect(customerLanguage(undefined)).toBe('en-IN');
  });

  it('knows exactly the three languages, each named in its own script', () => {
    expect(isCustomerLanguage('hi-IN')).toBe(true);
    expect(isCustomerLanguage('hi')).toBe(false);
    expect(isCustomerLanguage(7)).toBe(false);
    expect(CUSTOMER_LANGUAGES.map((language) => LANGUAGE_NAMES[language])).toEqual([
      'English',
      'मराठी',
      'हिंदी',
    ]);
  });
});

describe('which language the app uses after sign-in', () => {
  const holder = { familyMember: false } as const;

  it('opens a new phone in the language saved on the customer record', () => {
    expect(settleLanguage({ ...holder, phone: null, account: 'mr-IN' })).toEqual({
      language: 'mr-IN',
      save: false,
    });
  });

  it('follows the record once this phone’s choice is saved (the team may change it)', () => {
    const phone = { language: 'en-IN', unsaved: false } as const;
    expect(settleLanguage({ ...holder, phone, account: 'hi-IN' })).toEqual({
      language: 'hi-IN',
      save: false,
    });
  });

  it('keeps a choice made on the sign-in screen and saves it on the record', () => {
    const phone = { language: 'mr-IN', unsaved: true } as const;
    expect(settleLanguage({ ...holder, phone, account: 'en-IN' })).toEqual({
      language: 'mr-IN',
      save: true,
    });
  });

  it('does not save again when the record already has the phone’s choice', () => {
    const phone = { language: 'hi-IN', unsaved: true } as const;
    expect(settleLanguage({ ...holder, phone, account: 'hi-IN' })).toEqual({
      language: 'hi-IN',
      save: false,
    });
  });

  it('keeps a family member’s own choice on their phone, never on the record', () => {
    const phone = { language: 'hi-IN', unsaved: true } as const;
    expect(settleLanguage({ familyMember: true, phone, account: 'mr-IN' })).toEqual({
      language: 'hi-IN',
      save: false,
    });
    expect(settleLanguage({ familyMember: true, phone: null, account: 'mr-IN' })).toEqual({
      language: 'mr-IN',
      save: false,
    });
  });
});
