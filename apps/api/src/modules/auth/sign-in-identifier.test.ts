import { describe, expect, it } from 'vitest';
import { parseIdentifier } from './sign-in-identifier';

describe('parseIdentifier', () => {
  it.each(['98765 43210', '+91 98765 43210', '09876543210', '919876543210', '98765-43210'])(
    'reads %j as the mobile number +919876543210',
    (raw) => {
      expect(parseIdentifier(raw)).toEqual({ kind: 'phone', value: '+919876543210' });
    },
  );

  it('lowercases and trims an email', () => {
    expect(parseIdentifier(' Asha@OneOhm.in ')).toEqual({ kind: 'email', value: 'asha@oneohm.in' });
  });

  it('lowercases an employee code', () => {
    expect(parseIdentifier('EMP-12')).toEqual({ kind: 'code', value: 'emp-12' });
  });

  it('keeps a number that is not a mobile number as an employee code', () => {
    expect(parseIdentifier('12345')).toEqual({ kind: 'code', value: '12345' });
    expect(parseIdentifier('1234567890')).toEqual({ kind: 'code', value: '1234567890' });
  });
});
