import { describe, expect, it } from 'vitest';
import { formatValue, readableAction, readableKey, summarise, viewEntry } from './audit-format';

describe('readableAction', () => {
  it('turns a code into a sentence', () => {
    expect(readableAction('quotation.discount_approved')).toBe('Quotation discount approved');
  });
});

describe('readableKey', () => {
  it('splits camelCase and drops the Paise suffix', () => {
    expect(readableKey('flagDistanceM')).toBe('Flag distance m');
    expect(readableKey('discountPaise')).toBe('Discount');
    expect(readableKey('city')).toBe('City');
  });
});

describe('formatValue', () => {
  it('shows empty values as a dash and nested data as JSON', () => {
    expect(formatValue('x', null)).toBe('—');
    expect(formatValue('x', { a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatValue('flagged', true)).toBe('true');
  });

  it('shows Paise as rupees', () => {
    expect(formatValue('discountPaise', 150000)).toContain('1,500');
  });
});

describe('summarise', () => {
  it('joins simple values and skips nested ones', () => {
    expect(summarise({ city: 'Sangli', floors: 1, extra: { a: 1 }, none: null })).toBe(
      'city: Sangli · floors: 1',
    );
    expect(summarise(null)).toBe('');
  });
});

describe('viewEntry', () => {
  it('has nothing for empty data', () => {
    expect(viewEntry(null)).toEqual({ changes: [], details: [] });
  });

  it('lists plain data as details', () => {
    const view = viewEntry({ method: 'otp', meta: { a: 1 } });
    expect(view.changes).toEqual([]);
    expect(view.details.map((row) => [row.label, row.block])).toEqual([
      ['Method', false],
      ['Meta', true],
    ]);
  });

  it('shows only the fields that changed between before and after', () => {
    const view = viewEntry({
      before: { city: 'Pune', floors: 1 },
      after: { city: 'Sangli', floors: 1 },
      note: 'moved',
    });
    expect(view.changes).toEqual([{ key: 'city', label: 'City', from: 'Pune', to: 'Sangli' }]);
    expect(view.details.map((row) => row.key)).toEqual(['note']);
  });

  it('pairs from with to', () => {
    const view = viewEntry({ from: 'low', to: 'high', taskId: 'abc' });
    expect(view.changes).toEqual([{ key: 'from-to', label: 'Value', from: 'low', to: 'high' }]);
    expect(view.details.map((row) => row.key)).toEqual(['taskId']);
  });

  it('keeps a lone from as a plain detail', () => {
    const view = viewEntry({ from: 'low' });
    expect(view.changes).toEqual([]);
    expect(view.details).toHaveLength(1);
  });
});
