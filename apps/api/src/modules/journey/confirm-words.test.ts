import { describe, expect, it } from 'vitest';
import { confirmNoun, confirmWords } from './confirm-words';

describe('confirm words', () => {
  it('names every kind of question, with the roof as the default', () => {
    expect(confirmWords('installation').what).toBe('the installation check');
    expect(confirmWords('subsidy_register').what).toBe('the PM Surya Ghar registration');
    expect(confirmWords('subsidy_credit').cancelled).toMatch(/subsidy/);
    expect(confirmWords('bank_sign').what).toBe('the visit to the bank');
    expect(confirmWords('layout').cancelled).toMatch(/layout/);
    expect(confirmWords('site_ready').what).toBe('the roof check');
    expect(confirmWords('').what).toBe('the roof check');
  });

  it('gives a friendly noun for "We need … to continue."', () => {
    expect(confirmNoun('site_ready')).toBe('your roof check');
    expect(confirmNoun('installation')).toBe('your installation check');
    expect(confirmNoun('subsidy_credit')).toBe('your subsidy answer');
    expect(confirmNoun('bank_sign')).toBe('your visit to the bank');
    expect(confirmNoun('layout')).toBe('your panel layout');
    expect(confirmNoun('subsidy_register')).toBe('your PM Surya Ghar registration');
  });
});
