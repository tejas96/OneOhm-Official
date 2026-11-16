import { describe, expect, it } from 'vitest';
import { presentPayable } from './payable-view';

const bill = (patch: object = {}) =>
  ({
    id: 'b1',
    projectId: null,
    party: 'employee',
    partyName: 'Ravi',
    description: 'Travel',
    billNumber: null,
    amountPaise: 8400,
    dueOn: '2026-11-01',
    status: 'approved',
    approvedByUserId: null,
    approvedAt: null,
    paidOn: null,
    paidMethod: null,
    paidReference: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    advanceAdjustedPaise: 0,
    vendorInvoicePaise: null,
    gstPaise: 0,
    tdsBp: 0,
    tdsPaise: 0,
    paidPaise: 0,
    ...patch,
  }) as never;

describe('a bill as finance sees it', () => {
  it('shows the project the travel claim was for, joined in', () => {
    const view = presentPayable(bill(), { id: 'p1', code: 'P-12' }, null, '2026-11-15');
    expect(view).toMatchObject({ projectId: 'p1', projectCode: 'P-12' });
  });

  it('shows no project when there is none', () => {
    const view = presentPayable(bill(), { id: null, code: null }, null, '2026-11-15');
    expect(view).toMatchObject({ projectId: null, projectCode: null });
  });

  it('a cancelled bill owes nothing and is never overdue', () => {
    const view = presentPayable(
      bill({ status: 'cancelled' }),
      { id: null, code: null },
      null,
      '2026-11-15',
    );
    expect(view).toMatchObject({
      status: 'cancelled',
      leftPaise: 0,
      toPayPaise: 0,
      overdue: false,
    });
  });

  it('an open bill past due is overdue', () => {
    expect(presentPayable(bill(), { id: null, code: null }, null, '2026-11-15').overdue).toBe(true);
  });
});
