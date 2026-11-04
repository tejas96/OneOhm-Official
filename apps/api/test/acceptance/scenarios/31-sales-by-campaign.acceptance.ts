import type { LeadDetail, SalesReport } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { milestoneOf, owed, recordPayment } from '../support/money';
import { newCustomer, sellProject } from '../support/sales';

// Part 2, task 6: a lead page shows where the lead came from, and the sales report adds a
// "By campaign" table: leads → quoted → won → money the customers have paid.
const CODE = 'DIWALI26';

describe('Sales by campaign', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
    await rows('DELETE FROM lead_campaigns WHERE code = $1', [CODE]);
    await rows('UPDATE leads SET campaign_code = NULL WHERE campaign_code = $1', [CODE]);
    await admin.post('/lead-campaigns', { code: CODE, name: 'Diwali poster 2026' });
  });
  afterAll(closeDb);

  const tag = (leadId: string) =>
    rows('UPDATE leads SET campaign_code = $1 WHERE id = $2', [CODE, leadId]);

  it('shows the campaign on the lead, and in the report down to the advance collected', async () => {
    const sale = await sellProject(admin, { name: 'Campaign Won (test)' });
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    await recordPayment(admin, sale.project.id, advance, 'upi');
    const open = await newCustomer(admin, { name: 'Campaign Open (test)' });
    const plain = await newCustomer(admin, { name: 'No Campaign (test)' });
    await tag(sale.customer.leadId);
    await tag(open.leadId);

    const detail = await admin.get<LeadDetail>(`/leads/${open.leadId}`);
    expect(detail.attribution).toMatchObject({
      campaignCode: CODE,
      campaignName: 'Diwali poster 2026',
    });
    const untagged = await admin.get<LeadDetail>(`/leads/${plain.leadId}`);
    expect(untagged.attribution).toMatchObject({ campaignCode: null, campaignName: null });

    const report = await admin.get<SalesReport>('/business-reports/sales');
    const row = report.byCampaign.find((entry) => entry.key === CODE);
    expect(row).toMatchObject({
      label: 'Diwali poster 2026',
      leads: 2,
      quoted: 1,
      won: 1,
      advancePaid: 1,
      collectedPaise: owed(advance),
    });
    expect(row?.wonValuePaise).toBeGreaterThan(0);
    expect(report.byCampaign.find((entry) => entry.key === 'none')?.leads).toBeGreaterThanOrEqual(
      1,
    );
  });
});
