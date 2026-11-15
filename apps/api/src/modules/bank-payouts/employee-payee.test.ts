import { describe, expect, it, vi } from 'vitest';
import { scripted } from '../site-activity/travel-test-kit';
import { tellPayee } from './payee-message';
import { payeeOf } from './payees';
import { problemFor } from './payout-rules';

const person = { id: 'worker', fullName: 'Ravi Kumar', phoneE164: '+919800000001' };
const bankRow = (patch: object = {}) => ({
  id: 'worker',
  bankAccountName: 'Ravi Kumar',
  bankAccountNumber: '123456789012',
  bankIfsc: 'HDFC0001234',
  bankChangedByUserId: null,
  bankHoldUntil: null,
  bankHoldReleasedAt: null,
  ...patch,
});

/** No vendor, no crew, no crew advance, then the employee row. */
const employeeDb = (row: { person: object; bank: object | null } | null) =>
  scripted([[], [], [], row ? [row] : []]).tx as never;

describe('an employee as the payee of a travel bill (S8)', () => {
  it('finds the employee behind the bill, with their saved bank account', async () => {
    const payee = await payeeOf(employeeDb({ person, bank: bankRow() }), 'bill-1');
    expect(payee).toMatchObject({
      kind: 'employee',
      id: 'worker',
      name: 'Ravi Kumar',
      phone: '+919800000001',
      bank: { name: 'Ravi Kumar', accountNumber: '123456789012', ifsc: 'HDFC0001234' },
    });
    expect(payee?.hold.heldUntil).toBeNull();
  });

  it('is still a payee with no bank account yet: there is nothing to send to', async () => {
    const payee = await payeeOf(employeeDb({ person, bank: null }), 'bill-1');
    expect(payee).toMatchObject({ kind: 'employee', bank: {} });
    expect(
      problemFor({
        mode: 'sandbox',
        status: 'approved',
        payee,
        amountPaise: 8400,
        sending: false,
        held: false,
      }),
    ).toBe('no_bank_details');
  });

  it('carries the 24-hour hold of a changed account', async () => {
    const until = new Date(Date.now() + 3_600_000);
    const payee = await payeeOf(
      employeeDb({ person, bank: bankRow({ bankHoldUntil: until, bankChangedByUserId: 'x' }) }),
      'bill-1',
    );
    expect(payee?.hold).toMatchObject({ heldUntil: until, changedByUserId: 'x' });
  });

  it('is no payee when the bill is nobody’s', async () => {
    expect(await payeeOf(employeeDb(null), 'bill-1')).toBeNull();
  });

  it('goes through the same checks as a vendor: details, format, bill state', async () => {
    const payee = await payeeOf(employeeDb({ person, bank: bankRow() }), 'bill-1');
    const base = {
      mode: 'sandbox' as const,
      status: 'approved',
      payee,
      amountPaise: 8400,
      sending: false,
      held: false,
    };
    expect(problemFor(base)).toBeNull();
    expect(problemFor({ ...base, held: true })).toBe('bank_on_hold');
    expect(problemFor({ ...base, status: 'cancelled' })).toBe('not_approved');
    expect(problemFor({ ...base, status: 'pending' })).toBe('not_approved');
    const bad = await payeeOf(employeeDb({ person, bank: bankRow({ bankIfsc: 'bad' }) }), 'bill-1');
    expect(problemFor({ ...base, payee: bad })).toBe('bad_bank_details');
  });

  it('is told in the app, not by the vendor WhatsApp message', async () => {
    const insert = vi.fn();
    const { tx } = scripted([[], [], [], [{ person, bank: bankRow() }]]);
    const told = await tellPayee(
      { ...tx, insert } as never,
      { payableId: 'bill-1', id: 'p1', amountPaise: 8400, accountMasked: '•••• 9012' } as never,
      '2026-11-15',
      'UTR1',
    );
    expect(told).toBe('off');
    expect(insert).not.toHaveBeenCalled();
  });
});
