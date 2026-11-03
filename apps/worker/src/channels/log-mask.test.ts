import { describe, expect, it } from 'vitest';
import { maskPhone, withoutLinks } from './log-mask';

describe('log masking', () => {
  it('keeps only the last 4 digits of a phone', () => {
    expect(maskPhone('+919800001234')).toBe('+•••••1234');
    expect(maskPhone('1234')).toBe('1234');
  });

  it('drops links and tokens from log text', () => {
    const text = 'Pay https://x.example/v1/pay/abc.def now; see http://y.example/z?t=1';
    expect(withoutLinks(text)).toBe('Pay [link] now; see [link]');
    expect(withoutLinks('Hello')).toBe('Hello');
  });
});
