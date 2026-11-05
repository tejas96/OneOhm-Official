import { describe, expect, it } from 'vitest';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import { inLanguage } from './language';
import { homeOfPaper, missingRows } from './what-reads';

const home = (propertyId: string, title: string, projectId: string | null): CustomerHome => ({
  propertyId,
  projectId,
  title,
  description: '',
});
const SANGLI = home('p-sangli', 'Sangli', 'proj-sangli');
const FARM = home('p-farm', 'Farm', 'proj-farm');
const LEAD_ONLY = home('p-lead', 'Lead site', null);

const item = (key: string, askCategory: string, label = key) => ({ key, askCategory, label });
const checklists = (byProject: Record<string, ReturnType<typeof item>[]>) => ({
  missingFromCustomer: async (projectId: string) => (byProject[projectId] ?? []) as never,
});

describe('which papers a customer is offered when nothing is asked', () => {
  it('lists each home’s missing papers and an ID paper only once', async () => {
    const rows = await missingRows(
      checklists({
        'proj-sangli': [item('kyc', 'customer_kyc'), item('bill', 'electricity_bill')],
        'proj-farm': [item('kyc', 'customer_kyc'), item('bill', 'electricity_bill')],
      }),
      [SANGLI, FARM],
    );
    expect(rows.map((row) => [row.title, row.home])).toEqual([
      ['Aadhaar / PAN', null],
      ['Electricity bill', 'Sangli'],
      ['Electricity bill', 'Farm'],
    ]);
    expect(rows.filter((row) => row.propertyId === null)).toHaveLength(1);
  });

  it('skips a home that is only a lead (it has no checklist)', async () => {
    const rows = await missingRows(
      checklists({ 'proj-sangli': [item('bill', 'electricity_bill')] }),
      [SANGLI, LEAD_ONLY],
    );
    expect(rows).toHaveLength(1);
  });

  it('tells two papers of one kind on a home apart by their checklist names', async () => {
    const rows = await missingRows(
      checklists({
        'proj-sangli': [
          item('property', 'property', 'Property proof'),
          item('society', 'property', 'Society NOC'),
        ],
      }),
      [SANGLI],
    );
    expect(rows.map((row) => row.title)).toEqual(['Property proof', 'Society NOC']);
  });

  it('names a paper in the language being spoken', async () => {
    const rows = await inLanguage('mr', () =>
      missingRows(checklists({ 'proj-sangli': [item('bill', 'electricity_bill')] }), [SANGLI]),
    );
    expect(rows[0]?.title).toBe('वीज बिल');
  });
});

describe('the home a paper is for', () => {
  const paper = (category: string, propertyId: string | null) => ({ category, propertyId });

  it('an ID paper has none; a home paper has its own; a lone home is every paper’s', () => {
    expect(homeOfPaper([SANGLI, FARM], paper('customer_kyc', 'p-farm'))).toBeNull();
    expect(homeOfPaper([SANGLI, FARM], paper('electricity_bill', 'p-farm'))).toBe(FARM);
    expect(homeOfPaper([SANGLI], paper('electricity_bill', null))).toBe(SANGLI);
    expect(homeOfPaper([SANGLI, FARM], paper('electricity_bill', null))).toBeNull();
  });
});
