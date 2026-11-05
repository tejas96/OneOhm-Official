import { describe, expect, it } from 'vitest';
import { pendingButton, pendingLine, pendingRows } from './home-lines';
import { orderPending, type PendingItem } from './pending-items';

const ID = '0b6f2f9e-6c1a-4f43-9d55-3f3c2a1b7e10';
const quote: PendingItem = { kind: 'quote', quotationId: ID };
const problem: PendingItem = {
  kind: 'problem',
  requestId: ID,
  description: 'Inverter beeps (via WhatsApp)',
  home: null,
};
const visit: PendingItem = { kind: 'visit', requestId: ID, on: '2026-11-06', home: 'Sangli' };
const pay: PendingItem = { kind: 'pay', milestoneId: ID, leftPaise: 4_500_000, home: 'Sangli' };
const paper: PendingItem = {
  kind: 'paper',
  requestId: ID,
  title: 'Electricity bill',
  category: 'electricity_bill',
  home: 'Sangli',
};

describe('what matters now (redesign §3)', () => {
  it('orders: open ask → money due → visit in 3 days → open problem → quote waiting', () => {
    expect(orderPending([quote, problem, visit, pay, paper]).map((item) => item.kind)).toEqual([
      'paper',
      'pay',
      'visit',
      'problem',
      'quote',
    ]);
  });

  it('says each one in a line, with the button that does it', () => {
    expect(pendingLine(paper)).toBe('We need your *Electricity bill* for your Sangli home.');
    expect(pendingLine(pay)).toBe('*₹45,000* is due for your Sangli home.');
    expect(pendingLine(visit)).toContain('Our team visits your Sangli home on *');
    expect(pendingButton(paper, true)).toEqual({ id: `sendit:${ID}`, title: 'Send it now' });
    expect(pendingButton(pay, true)).toEqual({ id: `pay:${ID}`, title: 'Pay ₹45,000' });
    // Online payments off: the Payments answer instead of a pay link.
    expect(pendingButton(pay, false)).toBe('payments');
    expect(pendingButton(quote, true)).toEqual({
      id: `quote_show:${ID}`,
      title: 'See quotation',
    });
  });

  it('lists them for [See them], one row per action, never "(via WhatsApp)"', () => {
    const rows = pendingRows([paper, pay, problem, { ...problem, requestId: 'other' }], true);
    expect(rows.map((row) => row.id)).toEqual([`sendit:${ID}`, `pay:${ID}`, 'go:problems']);
    expect(rows[0]?.title).toBe('Electricity bill');
    expect(rows[2]?.description).toBe('Inverter beeps');
  });
});
