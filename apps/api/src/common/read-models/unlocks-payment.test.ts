import { describe, expect, it } from 'vitest';
import { unlocksPayment } from './unlocks-payment';

describe('unlocksPayment', () => {
  const waiting = new Set(['p1:installation_done']);

  it('is true when a payment still waits on this task', () => {
    expect(unlocksPayment('p1', 'installation_done', waiting)).toBe(true);
  });

  it('is false when the project has no such payment, or it is already due', () => {
    expect(unlocksPayment('p1', 'loan_disbursement', waiting)).toBe(false);
    expect(unlocksPayment('p2', 'installation_done', waiting)).toBe(false);
  });

  it('is false for tasks that unlock no payment', () => {
    expect(unlocksPayment('p1', null, waiting)).toBe(false);
    expect(unlocksPayment('p1', 'project_operational', waiting)).toBe(false);
  });
});
