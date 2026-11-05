import { describe, expect, it } from 'vitest';
import type { Actor } from '../../common/auth/actor';
import { mayUndo } from './payable-payment-undo';

const actor = (userId: string, ...caps: string[]) =>
  ({ userId, capabilities: new Set(caps) }) as unknown as Actor;
const hours = (h: number) => new Date(Date.now() - h * 3_600_000);
const payment = (by: string | null, age: number, extra = {}) => ({
  paidByUserId: by,
  createdAt: hours(age),
  reversedAt: null,
  bankPayoutId: null,
  ...extra,
});

describe('mayUndo', () => {
  const approver = actor('a', 'finance.approve_payments');
  const accounts = actor('b', 'finance.record_payments');
  it('lets an approver undo any hand-recorded payment', () => {
    expect(mayUndo(approver, payment('b', 100))).toBe(true);
  });
  it('lets the recorder undo their own within 24 hours only', () => {
    expect(mayUndo(accounts, payment('b', 23))).toBe(true);
    expect(mayUndo(accounts, payment('b', 25))).toBe(false);
    expect(mayUndo(accounts, payment('c', 1))).toBe(false);
  });
  it('never undoes a bank payment or one already undone', () => {
    expect(mayUndo(approver, payment('b', 1, { bankPayoutId: 'p' }))).toBe(false);
    expect(mayUndo(approver, payment('b', 1, { reversedAt: new Date() }))).toBe(false);
  });
});
