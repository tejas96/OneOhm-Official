import { describe, expect, it } from 'vitest';
import { type OpenPaper, papersForHome } from './paper-match';

const HOME = '11111111-1111-4111-8111-111111111111';
const FARM = '22222222-2222-4222-8222-222222222222';
const paper = (id: string, category: string, propertyId: string | null): OpenPaper => ({
  id,
  title: `${id} title`,
  category,
  propertyId,
});
const kyc = paper('kyc', 'customer_kyc', HOME);
const bill = paper('bill', 'electricity_bill', HOME);
const deed = paper('deed', 'property', FARM);

describe('papersForHome', () => {
  it('takes only the site papers of that home, never a person paper', () => {
    expect(papersForHome([kyc, bill, deed], { propertyId: FARM }, 2)).toEqual([deed]);
    expect(papersForHome([kyc, bill, deed], { propertyId: HOME }, 2)).toEqual([bill]);
  });

  it('gives the person row the ID and income papers', () => {
    const income = paper('income', 'income_proof', null);
    expect(papersForHome([kyc, bill, income], { propertyId: 'person' }, 2)).toEqual([kyc, income]);
  });

  it('lets one home answer person papers only when nothing else is open (decision 2)', () => {
    expect(papersForHome([kyc], { propertyId: HOME }, 1)).toEqual([kyc]);
    expect(papersForHome([kyc, bill], { propertyId: HOME }, 1)).toEqual([bill]);
    expect(papersForHome([kyc], { propertyId: HOME }, 2)).toEqual([]);
  });
});
