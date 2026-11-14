import { describe, expect, it } from 'vitest';
import { asOpener } from './entry-capture';

const db = (codes: string[]) =>
  ({ select: () => ({ from: async () => codes.map((code) => ({ code })) }) }) as never;
const stranger = { customerId: null, state: 'menu', context: {} };
const said = (text: string, kind: 'text' | 'choice' = 'text') => ({ kind, text }) as never;

describe('a bare campaign code from a new number', () => {
  it('is read as the "Hi OneOhm CODE" opener, in any case', async () => {
    for (const text of ['Diwali26', 'diwali26', ' DIWALI26 '])
      expect(await asOpener(db(['DIWALI26']), stranger, said(text))).toMatchObject({
        text: 'Hi OneOhm DIWALI26',
      });
  });

  it('stays as typed when the code is not listed, or is a known word', async () => {
    expect((await asOpener(db(['DIWALI26']), stranger, said('Summer27'))).text).toBe('Summer27');
    expect((await asOpener(db(['HI', 'MENU', 'PAY']), stranger, said('hi'))).text).toBe('hi');
    expect((await asOpener(db(['MENU']), stranger, said('menu'))).text).toBe('menu');
  });

  it('is left alone for a customer, a held chat, a tap, onboarding answers and longer words', async () => {
    const codes = db(['DIWALI26']);
    expect((await asOpener(codes, { ...stranger, customerId: 'c' }, said('Diwali26'))).text).toBe(
      'Diwali26',
    );
    expect((await asOpener(codes, { ...stranger, state: 'human' }, said('Diwali26'))).text).toBe(
      'Diwali26',
    );
    expect((await asOpener(codes, stranger, said('Diwali26', 'choice'))).text).toBe('Diwali26');
    expect((await asOpener(codes, stranger, said('Diwali26 offer'))).text).toBe('Diwali26 offer');
    expect(
      (await asOpener(codes, { ...stranger, state: 'onboard:city' }, said('Diwali26'))).text,
    ).toBe('Diwali26');
  });
});
