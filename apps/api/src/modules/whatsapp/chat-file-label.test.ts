import { describe, expect, it } from 'vitest';
import { filedAs } from './chat-file-label';

const pune = { propertyId: 'p1', label: null, city: 'Pune', consumerNumber: '1234567' };
const farm = { propertyId: 'p2', label: 'Farm', city: 'Sangli', consumerNumber: null };
const file = (over: Partial<Parameters<typeof filedAs>[0]>) => ({
  id: 'd1',
  name: 'a.jpg',
  contentType: 'image/jpeg',
  category: 'other',
  projectId: null,
  propertyId: null,
  serviceRequestId: null,
  leadId: null,
  ...over,
});

describe('filedAs', () => {
  it('names the kind and the home', () => {
    const one = file({ category: 'electricity_bill', propertyId: 'p1', projectId: 'x' });
    expect(filedAs(one, [pune, farm])).toBe('Electricity bill · Pune');
  });

  it('is null while the file is still to sort', () => {
    expect(filedAs(file({}), [pune])).toBeNull();
  });

  it('is the kind alone for ID papers and for a project with no home', () => {
    expect(filedAs(file({ category: 'customer_kyc' }), [pune])).toBe('Customer ID and KYC');
    expect(filedAs(file({ category: 'other', projectId: 'x' }), [pune])).toBe('Other');
  });

  it("names a lead's file as on the lead, not to sort", () => {
    expect(filedAs(file({ category: 'electricity_bill', leadId: 'l1' }), [])).toBe(
      'Electricity bill · Lead',
    );
  });

  it('tells two homes of one name apart', () => {
    const twin = { ...farm, propertyId: 'p3', label: 'Pune', consumerNumber: '99994821' };
    const home = file({ category: 'property', propertyId: 'p3' });
    expect(filedAs(home, [pune, twin])).toBe('Property papers · Pune (consumer no. ending 4821)');
  });
});
