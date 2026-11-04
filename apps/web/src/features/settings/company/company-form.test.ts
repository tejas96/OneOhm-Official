import { describe, expect, it } from 'vitest';
import { listFieldError, phonesText, splitPhones } from './company-form';

describe('listFieldError', () => {
  it('shows an error the API named by line (phones.0) against the whole box', () => {
    expect(listFieldError({ 'phones.1': 'Enter a valid phone number' }, 'phones')).toBe(
      'Enter a valid phone number',
    );
  });

  it('prefers an error on the list itself', () => {
    expect(listFieldError({ phones: 'Too many', 'phones.0': 'Bad' }, 'phones')).toBe('Too many');
  });

  it('ignores other fields that only start with the same letters', () => {
    expect(listFieldError({ phonesExtra: 'x', email: 'y' }, 'phones')).toBeUndefined();
  });
});

describe('phones text', () => {
  it('round-trips the saved list, so an untouched box is not a change', () => {
    const saved = ['+91 98450 00000', '080 1234 5678'];
    expect(splitPhones(phonesText(saved))).toEqual(saved);
    expect(splitPhones('  a \n\n b ')).toEqual(['a', 'b']);
  });
});
