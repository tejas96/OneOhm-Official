import type {
  Payable,
  ProfitabilityReport,
  QuotationDetail,
  QuotationPreview,
  TravelClaim,
  WorkOrderDetail,
} from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { retire } from '../support/people';
import { quoteInput, type Sale, sellProject, today } from '../support/sales';
import { CREWS, contractorByName } from '../support/team';
import { claimProjectTravel, type ProjectTravel } from '../support/travel';

// PRD 13 "Costing": cable, structure, labour, travel and contractor costs are measurable
// and traceable — estimated line by line on the quotation, actual bill by bill and claim
// by claim on the project, and both side by side in the profitability report.
const CABLE_BILL = 12_000_00;
const STRUCTURE_BILL = 18_500_00;
const CONTRACTOR_ADVANCE = 3_000_00;

describe('Costing', () => {
  let admin: Session;
  let sale: Sale;
  let quote: QuotationDetail;
  let travel: ProjectTravel | null = null;
  const bills: Payable[] = [];

  beforeAll(async () => {
    admin = await Session.admin();
    const crew = await contractorByName(admin, CREWS.main.name);
    sale = await sellProject(admin, { name: 'Costing Customer (test)', contractorId: crew.id });
    quote = await admin.get<QuotationDetail>(`/quotations/${sale.quotation.id}`);
  });
  afterAll(async () => {
    if (travel) await retire(admin, [travel.person]);
  });

  it('estimates cable, structure, labour and travel as separate costed lines', async () => {
    const line = (key: string) => quote.lines.find((entry) => entry.key === key);
    for (const key of ['dc_cable', 'ac_cable', 'structure', 'installation', 'transport']) {
      expect({ key, costed: (line(key)?.costPaise ?? 0) > 0 }).toEqual({ key, costed: true });
    }
    expect(line('dc_cable')?.category).toBe('cable');
    expect(line('dc_cable')?.unit).toBe('m');
    const build = quote.costing?.build;
    expect(build?.materialPaise).toBeGreaterThan(0);
    expect(build?.labourPaise).toBeGreaterThan(0);
    expect(build?.travelPaise).toBeGreaterThan(0);
    // Every line's cost adds up to the quotation's cost: nothing hidden.
    const counted = quote.lines.filter((entry) => entry.extra !== 'optional');
    const sum = counted.reduce((total, entry) => total + entry.costPaise, 0);
    expect(sum).toBe(quote.totals.costPaise);
  });

  it('measures cable by the metre: a longer run costs proportionally more', async () => {
    const priced = async (dcCableMeters: number) => {
      const preview = await admin.post<QuotationPreview>('/quotations/preview', {
        ...(await quoteInput(admin, { targetWp: 3000 })),
        propertyId: null,
        dcCableMeters,
      });
      const dc = preview.lines.find((entry) => entry.key === 'dc_cable');
      return { meters: dc?.quantity ?? 0, cost: dc?.costPaise ?? 0, basis: dc?.basis };
    };
    const short = await priced(20);
    const long = await priced(40);
    expect(short.meters).toBe(20);
    expect(long.meters).toBe(40);
    expect(long.basis).toBe('survey');
    expect(long.cost).toBe(short.cost * 2);
  });

  it('books cable and structure bills from vendors against the project', async () => {
    const add = (partyName: string, description: string, amountPaise: number) =>
      admin.post<Payable>('/finance/payables', {
        projectId: sale.project.id,
        party: 'vendor',
        partyName,
        description,
        billNumber: `TEST-${Date.now()}`,
        amountPaise,
        dueOn: today(),
        tdsBp: 0,
      });
    bills.push(await add('Sangli Cable Traders (test)', 'DC and AC cable (test)', CABLE_BILL));
    bills.push(await add('Miraj Fabricators (test)', 'Mounting structure (test)', STRUCTURE_BILL));
    const listed = await admin.get<Payable[]>('/finance/payables?status=all');
    const onProject = listed.filter((row) => row.projectId === sale.project.id);
    expect(onProject.map((row) => row.description)).toEqual(
      expect.arrayContaining(['DC and AC cable (test)', 'Mounting structure (test)']),
    );
    expect(onProject.every((row) => row.projectCode === sale.project.code)).toBe(true);
  });

  it('books the contractor’s labour against the project through its work order', async () => {
    const crew = await contractorByName(admin, CREWS.main.name);
    const order = await admin.post<WorkOrderDetail>(`/contractors/${crew.id}/work-orders`, {
      projectId: sale.project.id,
      scope: 'Installation labour (test)',
    });
    const after = await admin.post<WorkOrderDetail>(`/work-orders/${order.id}/advances`, {
      amountPaise: CONTRACTOR_ADVANCE,
      note: 'Labour advance (test)',
    });
    expect(after.project.id).toBe(sale.project.id);
    expect(after.advances.at(-1)?.amountPaise).toBe(CONTRACTOR_ADVANCE);
    // The labour the crew will be paid is priced from its rate card, per kWp.
    expect(after.lines.some((entry) => entry.basis === 'per_kwp')).toBe(true);
  });

  it('turns site visits into a travel claim that counts for the project', async () => {
    travel = await claimProjectTravel(admin, sale.project, 'Costing Traveller (test)');
    expect(travel.day.visits.length).toBe(2);
    expect(travel.day.distanceM).toBeGreaterThan(5_000);
    expect(travel.claim.status).toBe('approved');
    expect(travel.claim.project?.id).toBe(sale.project.id);
    expect(travel.claim.amountPaise).toBe(
      Math.round((travel.claim.distanceM * travel.claim.ratePaisePerKm) / 1000),
    );
    const claims = await admin.get<TravelClaim[]>(`/travel-claims?userId=${travel.person.id}`);
    expect(claims.map((claim) => claim.id)).toContain(travel.claim.id);
  });

  it('shows estimate against actual, by source, in the profitability report', async () => {
    const report = await admin.get<ProfitabilityReport>('/business-reports/profitability');
    const row = report.byProject.find((entry) => entry.projectId === sale.project.id);
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.estimatedCostPaise).toBe(quote.totals.costPaise);
    expect(row.contractPaise).toBe(quote.totals.totalPaise - quote.totals.taxPaise);
    expect(row.actual.vendorPaise).toBe(CABLE_BILL + STRUCTURE_BILL);
    expect(row.actual.contractorPaise).toBe(CONTRACTOR_ADVANCE);
    expect(row.actual.travelPaise).toBe(travel?.claim.amountPaise ?? -1);
    const actual =
      row.actual.stockPaise +
      row.actual.vendorPaise +
      row.actual.contractorPaise +
      row.actual.travelPaise;
    expect(row.actualCostPaise).toBe(actual);
    expect(row.variancePaise).toBe(row.actualCostPaise - row.estimatedCostPaise);
    expect(report.cost.estimate.materialPaise).toBeGreaterThan(0);
    expect(report.cost.estimate.installationPaise).toBeGreaterThan(0);
  });
});
