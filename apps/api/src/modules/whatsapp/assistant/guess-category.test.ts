import { describe, expect, it } from 'vitest';
import { guessCategory, readReferral } from './guess-category';

describe('assistant reading', () => {
  it('guesses the kind of problem', () => {
    expect(guessCategory('Inverter shows E021 since morning').category).toBe('inverter_error');
    expect(guessCategory('Panels need cleaning').category).toBe('cleaning');
    expect(guessCategory('Hello').category).toBe('other');
  });

  it('reads a name and mobile number', () => {
    expect(readReferral('Suresh Patil 98765 43210')).toEqual({
      name: 'Suresh Patil',
      phone: '+919876543210',
    });
    expect(readReferral('+91 9876543210 Asha')).toEqual({ name: 'Asha', phone: '+919876543210' });
    expect(readReferral('just a name')).toBeNull();
  });
});
