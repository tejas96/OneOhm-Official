import { beforeEach, describe, expect, it, vi } from 'vitest';

const hold = vi.hoisted(() => ({ recordBankChange: vi.fn(async () => 'added') }));
vi.mock('./bank-hold', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bank-hold')>()),
  ...hold,
}));

import { actor } from '../site-activity/site-visit-test-kit';
import { scripted } from '../site-activity/travel-test-kit';
import { EmployeeBankService } from './employee-bank.service';

const input = {
  bankAccountName: ' Ravi Kumar ',
  bankIfsc: 'hdfc0001234',
  bankAccountNumber: '1234 5678 9012',
  bankAccountNumberConfirm: '123456789012',
};

function save(who: ReturnType<typeof actor>, before: object | null = null) {
  const { tx, updates } = scripted([
    [{ id: 'worker', fullName: 'Ravi Kumar' }],
    before ? [before] : [{ id: 'worker' }],
    [
      {
        bankAccountName: 'Ravi Kumar',
        bankAccountNumber: '123456789012',
        bankIfsc: 'HDFC0001234',
        bankHoldUntil: null,
      },
    ],
  ]);
  return { updates, result: new EmployeeBankService(tx as never).save(who, 'worker', input) };
}

beforeEach(() => vi.clearAllMocks());

describe('an employee bank account (S8)', () => {
  it('lets the employee save their own, tidied, and masks the number in the answer', async () => {
    const { updates, result } = save(actor('worker'));
    const view = await result;
    expect(updates[0]?.set).toMatchObject({
      bankAccountName: 'Ravi Kumar',
      bankIfsc: 'HDFC0001234',
      bankAccountNumber: '123456789012',
    });
    expect(view.bankAccountMasked).not.toContain('123456789012');
    expect(view.bankAccountMasked).toContain('9012');
  });

  it('lets finance save it for them', async () => {
    await expect(save(actor('fin', ['finance.record_payments'])).result).resolves.toBeDefined();
  });

  it('refuses anyone else', async () => {
    await expect(save(actor('peer', ['leave.approve'])).result).rejects.toMatchObject({
      status: 403,
    });
  });

  it('starts the same hold, audit and alert as a vendor, through the one shared path', async () => {
    await save(actor('worker'), {
      id: 'worker',
      bankAccountName: 'Ravi Kumar',
      bankAccountNumber: '999999999999',
      bankIfsc: 'HDFC0001234',
    }).result;
    expect(hold.recordBankChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'employee',
        id: 'worker',
        payeeName: 'Ravi Kumar',
        before: expect.objectContaining({ accountNumber: '999999999999' }),
        after: expect.objectContaining({ accountNumber: '123456789012' }),
      }),
    );
  });
});
