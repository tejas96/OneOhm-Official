import { describe, expect, it } from 'vitest';
import { checkInspection } from './inspection';
import { canStepRequest, earliestNeed } from './purchase-requests';
import { fellBelowMinimum } from './stock-alerts';
import {
  deliveryOutcome,
  type OrderDelivery,
  payableAgeing,
  summariseDeliveries,
} from './vendor-performance';

const TODAY = '2026-11-01';
const order = (patch: Partial<OrderDelivery>): OrderDelivery => ({
  status: 'received',
  orderDate: '2026-10-01',
  expectedOn: '2026-10-10',
  totalPaise: 1_000,
  receivedOn: ['2026-10-08'],
  ...patch,
});

describe('deliveryOutcome', () => {
  it('is on time when the last receipt is on or before the expected date', () => {
    expect(deliveryOutcome(order({ receivedOn: ['2026-10-05', '2026-10-10'] }), TODAY)).toBe(
      'on_time',
    );
  });

  it('is late when the last receipt came after the expected date', () => {
    expect(deliveryOutcome(order({ receivedOn: ['2026-10-05', '2026-10-12'] }), TODAY)).toBe(
      'late',
    );
  });

  it('counts an order closed short by its last receipt', () => {
    expect(deliveryOutcome(order({ status: 'closed', receivedOn: ['2026-10-09'] }), TODAY)).toBe(
      'on_time',
    );
  });

  it('flags open orders past their date, and ignores drafts and cancelled ones', () => {
    expect(deliveryOutcome(order({ status: 'partly_received' }), TODAY)).toBe('open_late');
    expect(deliveryOutcome(order({ status: 'sent', expectedOn: '2026-11-05' }), TODAY)).toBe(
      'open',
    );
    expect(deliveryOutcome(order({ status: 'draft' }), TODAY)).toBe('not_ordered');
    expect(deliveryOutcome(order({ status: 'cancelled' }), TODAY)).toBe('not_ordered');
    expect(deliveryOutcome(order({ expectedOn: null }), TODAY)).toBe('no_date');
  });
});

describe('summariseDeliveries', () => {
  it('works out the on-time share and the average days to deliver', () => {
    const summary = summariseDeliveries(
      [
        order({ receivedOn: ['2026-10-08'] }), // on time, 7 days
        order({ receivedOn: ['2026-10-15'] }), // late, 14 days
        order({ expectedOn: null, receivedOn: ['2026-10-04'] }), // no date, 3 days
        order({ status: 'sent', expectedOn: '2026-10-20', receivedOn: [] }), // open, late
        order({ status: 'draft', totalPaise: 99_999 }),
      ],
      TODAY,
    );
    expect(summary).toEqual({
      orders: 4,
      orderedPaise: 4_000,
      delivered: 3,
      onTime: 1,
      late: 1,
      openLate: 1,
      onTimeBp: 3_333,
      averageDaysToDeliver: 8,
    });
  });

  it('has no rate before anything is judged', () => {
    const summary = summariseDeliveries(
      [order({ status: 'sent', receivedOn: [], expectedOn: null })],
      TODAY,
    );
    expect(summary.onTimeBp).toBeNull();
    expect(summary.averageDaysToDeliver).toBeNull();
  });
});

describe('payableAgeing', () => {
  it('buckets what is still owed by days since the bill', () => {
    const ageing = payableAgeing(
      [
        { balancePaise: 100, billedOn: '2026-11-01', dueOn: '2026-12-01' }, // 0 days
        { balancePaise: 200, billedOn: '2026-10-02', dueOn: '2026-11-01' }, // 30 days
        { balancePaise: 300, billedOn: '2026-10-01', dueOn: '2026-10-31' }, // 31 days, overdue
        { balancePaise: 400, billedOn: '2026-08-03', dueOn: '2026-09-02' }, // 90 days
        { balancePaise: 500, billedOn: '2026-08-02', dueOn: '2026-09-01' }, // 91 days
        { balancePaise: 0, billedOn: '2026-01-01', dueOn: '2026-01-31' }, // settled by advance
      ],
      TODAY,
    );
    expect(ageing.buckets).toEqual({
      current: 300,
      days_31_60: 300,
      days_61_90: 400,
      days_over_90: 500,
    });
    expect(ageing.totalPaise).toBe(1_500);
    expect(ageing.overduePaise).toBe(1_200);
  });
});

describe('purchase requests', () => {
  it('approves or rejects only pending requests, and orders only approved ones', () => {
    expect(canStepRequest('pending', 'approve')).toBe(true);
    expect(canStepRequest('rejected', 'approve')).toBe(false);
    expect(canStepRequest('pending', 'order')).toBe(false);
    expect(canStepRequest('approved', 'order')).toBe(true);
    expect(canStepRequest('ordered', 'cancel')).toBe(false);
  });

  it('finds the earliest need-by date', () => {
    expect(earliestNeed([{ neededBy: '2026-11-20' }, { neededBy: '2026-11-09' }])).toBe(
      '2026-11-09',
    );
    expect(earliestNeed([])).toBeNull();
  });
});

describe('fellBelowMinimum', () => {
  it('alerts only on the movement that crosses below the reorder level', () => {
    expect(fellBelowMinimum(10, 12, 8)).toBe(true);
    expect(fellBelowMinimum(10, 10, 9)).toBe(true);
    expect(fellBelowMinimum(10, 9, 5)).toBe(false);
    expect(fellBelowMinimum(10, 15, 10)).toBe(false);
  });
});

describe('checkInspection', () => {
  const panel = { ordered: 10, received: 4, serialised: true };
  it('behaves like a plain receipt when nothing is rejected', () => {
    expect(checkInspection(panel, 6, 0)).toBeNull();
    expect(checkInspection(panel, 0, 0)).toBe('not_positive');
    expect(checkInspection(panel, 7, 0)).toBe('over_received');
  });

  it('allows a delivery where every unit failed inspection', () => {
    expect(checkInspection(panel, 0, 3)).toBeNull();
  });

  it('never lets accepted and rejected together pass what is still due', () => {
    expect(checkInspection(panel, 4, 2)).toBeNull();
    expect(checkInspection(panel, 4, 3)).toBe('over_delivered');
  });

  it('counts serialised rejects in whole units', () => {
    expect(checkInspection(panel, 1, 0.5)).toBe('rejected_not_whole');
    expect(
      checkInspection({ ordered: 100, received: 0, serialised: false }, 40.5, 2.25),
    ).toBeNull();
  });
});
