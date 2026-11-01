import { describe, expect, it } from 'vitest';
import {
  applyStockChange,
  available,
  checkReceipt,
  checkSerials,
  parseSerials,
  receiptStage,
  shortages,
} from './stock-rules';

describe('applyStockChange', () => {
  it('adds received stock', () => {
    expect(applyStockChange({ onHand: 4, reserved: 0 }, { onHand: 6, reserved: 0 })).toEqual({
      level: { onHand: 10, reserved: 0 },
    });
  });

  it('never lets stock go below zero', () => {
    expect(applyStockChange({ onHand: 2, reserved: 0 }, { onHand: -3, reserved: 0 })).toEqual({
      problem: 'negative_stock',
    });
  });

  it('never reserves more than is on hand', () => {
    expect(applyStockChange({ onHand: 10, reserved: 8 }, { onHand: 0, reserved: 4 })).toEqual({
      problem: 'reserved_exceeds_stock',
    });
  });

  it('dispatch takes stock and its reservation together', () => {
    expect(applyStockChange({ onHand: 10, reserved: 6 }, { onHand: -6, reserved: -6 })).toEqual({
      level: { onHand: 4, reserved: 0 },
    });
  });

  it('ignores float noise on metre quantities', () => {
    const result = applyStockChange(
      { onHand: 0.3, reserved: 0 },
      { onHand: -0.1 - 0.2, reserved: 0 },
    );
    expect(result).toEqual({ level: { onHand: 0, reserved: 0 } });
    expect(available({ onHand: 12.5, reserved: 2.25 })).toBe(10.25);
  });
});

describe('checkReceipt', () => {
  const line = { ordered: 10, received: 6, serialised: true };

  it('accepts up to what is still due', () => {
    expect(checkReceipt(line, 4)).toBeNull();
  });

  it('rejects receiving more than was ordered', () => {
    expect(checkReceipt(line, 5)).toBe('over_received');
  });

  it('rejects zero, negative and part units of serialised items', () => {
    expect(checkReceipt(line, 0)).toBe('not_positive');
    expect(checkReceipt(line, -1)).toBe('not_positive');
    expect(checkReceipt(line, 1.5)).toBe('not_whole');
    expect(checkReceipt({ ordered: 100, received: 0, serialised: false }, 12.5)).toBeNull();
  });
});

describe('serials', () => {
  it('needs exactly one serial per unit, without repeats', () => {
    expect(checkSerials(2, ['ab-1', ' AB-2 '])).toEqual({ serials: ['AB-1', 'AB-2'] });
    expect(checkSerials(3, ['A', 'B'])).toEqual({ problem: 'count_mismatch' });
    expect(checkSerials(2, ['A', 'a'])).toEqual({ problem: 'duplicate' });
    expect(checkSerials(1, ['  '])).toEqual({ problem: 'blank' });
  });

  it('reads pasted lists', () => {
    expect(parseSerials('SN1\nSN2, SN3;SN4  SN5')).toEqual(['SN1', 'SN2', 'SN3', 'SN4', 'SN5']);
  });
});

describe('receiptStage and shortages', () => {
  it('moves a PO from sent to partly received to received', () => {
    expect(receiptStage([{ ordered: 2, received: 0 }])).toBe('sent');
    expect(
      receiptStage([
        { ordered: 2, received: 1 },
        { ordered: 1, received: 1 },
      ]),
    ).toBe('partly_received');
    expect(receiptStage([{ ordered: 2, received: 2 }])).toBe('received');
  });

  it('lists what stock cannot cover', () => {
    const free = new Map([
      ['panel', 8],
      ['inverter', 1],
    ]);
    expect(
      shortages(
        [
          { productId: 'panel', quantity: 10 },
          { productId: 'inverter', quantity: 1 },
        ],
        free,
      ),
    ).toEqual([{ productId: 'panel', needed: 10, available: 8 }]);
  });
});
