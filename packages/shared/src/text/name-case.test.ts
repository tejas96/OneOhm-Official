import { describe, expect, it } from 'vitest';
import { titleCaseName } from './name-case';

describe('titleCaseName', () => {
  it('capitalises each word of a name typed in lower case (live review C15)', () => {
    expect(titleCaseName('tejas')).toBe('Tejas');
    expect(titleCaseName('  ravi   patil ')).toBe('Ravi Patil');
    expect(titleCaseName('d’souza-rao')).toBe('D’souza-Rao');
  });
  it('keeps names already cased, short forms and other scripts as they are', () => {
    expect(titleCaseName('Asha McKenzie')).toBe('Asha McKenzie');
    expect(titleCaseName('AB Patil')).toBe('AB Patil');
    expect(titleCaseName('प्रिया कुलकर्णी')).toBe('प्रिया कुलकर्णी');
  });
});
