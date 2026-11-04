import { describe, expect, it } from 'vitest';
import type { OpenPaper } from './paper-match';
import { stillAsked } from './what-saved';

const paper = (id: string, category: string, propertyId: string | null): OpenPaper => ({
  id,
  title: id,
  category,
  propertyId,
});
const bill = paper('bill', 'electricity_bill', 'p1');
const deed = paper('deed', 'property', 'p1');
const farmBill = paper('farm', 'electricity_bill', 'p2');
const pan = paper('pan', 'customer_kyc', null);

describe('what a home still needs after a paper is saved', () => {
  it('names only the other papers asked for that home', () => {
    const left = stillAsked(
      [bill, deed, farmBill, pan],
      { category: 'electricity_bill', home: 'p1' },
      2,
      'bill',
    );
    expect(left.map((one) => one.id)).toEqual(['deed']);
  });

  it('an ID paper is about the person: only other ID papers are still needed', () => {
    const aadhaar = paper('aadhaar', 'customer_kyc', null);
    const left = stillAsked(
      [aadhaar, pan, bill],
      { category: 'customer_kyc', home: 'person' },
      2,
      'aadhaar',
    );
    expect(left.map((one) => one.id)).toEqual(['pan']);
  });

  it('with one home, its ID paper and papers asked on no home are still needed too', () => {
    const noHome = paper('noHome', 'property', null);
    const left = stillAsked(
      [bill, pan, noHome],
      { category: 'electricity_bill', home: 'p1' },
      1,
      'bill',
    );
    expect(left.map((one) => one.id)).toEqual(['pan', 'noHome']);
  });
});
