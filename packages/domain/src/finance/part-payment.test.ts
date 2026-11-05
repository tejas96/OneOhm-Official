import { describe, expect, it } from 'vitest';
import { leftToPay, overpaidBy, partPaymentProblem } from './part-payment';

const bill = { amountPaise: 1_000_000, tdsPaise: 20_000, advanceAdjustedPaise: 80_000 };

describe('leftToPay', () => {
  it('is what is to pay when nothing is paid', () => {
    expect(leftToPay({ ...bill, paidPaise: 0 })).toBe(900_000);
  });
  it('goes down with each part paid', () => {
    expect(leftToPay({ ...bill, paidPaise: 350_000 })).toBe(550_000);
    expect(leftToPay({ ...bill, paidPaise: 900_000 })).toBe(0);
  });
  it('never goes below zero, even when paid more than the bill', () => {
    expect(leftToPay({ ...bill, paidPaise: 950_000 })).toBe(0);
  });
});

describe('partPaymentProblem', () => {
  it('accepts anything from ₹1 up to what is left', () => {
    expect(partPaymentProblem(100, 900_000)).toBeNull();
    expect(partPaymentProblem(900_000, 900_000)).toBeNull();
  });
  it('refuses less than ₹1, more than left, and fractions of a paisa', () => {
    expect(partPaymentProblem(99, 900_000)).toBe('The least you can pay is ₹1.');
    expect(partPaymentProblem(0, 900_000)).toBe('The least you can pay is ₹1.');
    expect(partPaymentProblem(900_001, 900_000)).toBe(
      'That is more than what is left to pay (₹9,000).',
    );
    expect(partPaymentProblem(150.5, 900_000)).toBe('Enter the amount in rupees and paise.');
  });
  it('refuses when nothing is left', () => {
    expect(partPaymentProblem(100, 0)).toBe('Nothing is left to pay on this bill.');
  });
});

describe('overpaidBy', () => {
  it('is the part above what was left', () => {
    expect(overpaidBy(500_000, 200_000)).toBe(300_000);
    expect(overpaidBy(100_000, 200_000)).toBe(0);
    expect(overpaidBy(100_000, 0)).toBe(100_000);
  });
});
