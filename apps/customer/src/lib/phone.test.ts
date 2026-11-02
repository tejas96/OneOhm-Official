import { describe, expect, it } from 'vitest';
import { indianMobile } from './phone';

describe('indianMobile', () => {
  it('keeps the 10 digits of a mobile number however it was typed', () => {
    expect(indianMobile('98765 43210')).toBe('9876543210');
    expect(indianMobile(' +91 98765-43210 ')).toBe('9876543210');
    expect(indianMobile('09876543210')).toBe('9876543210');
    expect(indianMobile('6000000000')).toBe('6000000000');
  });

  it('turns away anything that is not an Indian mobile number', () => {
    expect(indianMobile('')).toBeNull();
    expect(indianMobile('5876543210')).toBeNull();
    expect(indianMobile('987654321')).toBeNull();
    expect(indianMobile('98765432101')).toBeNull();
    expect(indianMobile('98765abcde')).toBeNull();
  });
});
