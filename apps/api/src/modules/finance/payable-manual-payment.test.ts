import { describe, expect, it } from 'vitest';
import { actor } from '../site-activity/site-visit-test-kit';
import { scripted } from '../site-activity/travel-test-kit';
import { recordManualPayment } from './payable-manual-payment';

const pay = (status: string) => {
  // The lock read, the open transfer check, then the bill.
  const { tx } = scripted([[], [], [{ id: 'b1', status, amountPaise: 8400 }]]);
  return recordManualPayment(tx as never, actor('fin'), 'b1', {
    method: 'upi',
    paidOn: '2026-11-15',
  });
};

describe('paying a bill by hand', () => {
  it('refuses a cancelled bill (a voided travel claim): nothing is owed', async () => {
    await expect(pay('cancelled')).rejects.toMatchObject({ status: 409, code: 'cancelled' });
  });

  it('still refuses a bill that is waiting for approval', async () => {
    await expect(pay('pending')).rejects.toMatchObject({ status: 409 });
  });
});
