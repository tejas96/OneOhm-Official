import type { LeadDetail, SalesReport } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { leadsOf, tap, upToSite, withOnboarding } from '../support/onboarding';
import { uniquePhone } from '../support/sales';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// Part 3, task 8: staff see the estimate the customer got on the lead page, open its PDF,
// and the sales report's "By campaign" table counts the leads that got an estimate.
const CODE = 'ESTVIEW26';

/** Onboarding from "hi" to the estimate, for a home site. Returns the new lead's id. */
async function estimated(phone: string): Promise<string> {
  await upToSite(phone);
  await tap(phone, 'ob:site:home');
  await tap(phone, 'ob:bill:2000_3000');
  await tap(phone, 'ob:roof:rcc');
  await tap(phone, 'ob:floors:1');
  await tap(phone, 'ob:photo:later');
  const [lead] = await leadsOf(phone);
  if (!lead) throw new Error('No lead was made.');
  return lead.id;
}

describe('Staff see the estimate the customer got', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
    await rows('DELETE FROM lead_campaigns WHERE code = $1', [CODE]);
    await rows('UPDATE leads SET campaign_code = NULL WHERE campaign_code = $1', [CODE]);
    await admin.post('/lead-campaigns', { code: CODE, name: 'Estimate view 2026' });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('the lead page has the latest estimate and a PDF staff can open; others get 403', async () => {
    const leadId = await estimated(uniquePhone());
    const [estimate] = await rows<{ id: string; capacity_wp: number; effective_paise: number }>(
      `SELECT id, capacity_wp, effective_paise::int AS effective_paise
         FROM lead_estimates WHERE lead_id = $1`,
      [leadId],
    );

    const detail = await admin.get<LeadDetail>(`/leads/${leadId}`);
    expect(detail.latestEstimate).toMatchObject({
      id: estimate?.id,
      capacityWp: estimate?.capacity_wp,
      effectivePaise: estimate?.effective_paise,
    });
    expect(detail.latestEstimate?.pdfUrl).toBe(`/leads/${leadId}/estimates/${estimate?.id}/pdf`);
    const file = await admin.download(detail.latestEstimate?.pdfUrl ?? '');
    expect(file.status).toBe(200);
    expect(file.type).toContain('application/pdf');
    expect(file.bytes.subarray(0, 4).toString()).toBe('%PDF');

    // An estimate that belongs to another lead is not found under this one.
    const otherLead = await estimated(uniquePhone());
    const [theirs] = await rows<{ id: string }>(
      'SELECT id FROM lead_estimates WHERE lead_id = $1',
      [otherLead],
    );
    const other = await admin.download(`/leads/${leadId}/estimates/${theirs?.id}/pdf`);
    expect(other.status).toBe(404);

    const outsider = await Session.password(staffEmail('execution'), TEAM_PASSWORD);
    expect((await outsider.download(`/leads/${leadId}/estimates/${estimate?.id}/pdf`)).status).toBe(
      403,
    );
  });

  it('a lead with no estimate has latestEstimate null', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:site:farm');
    const [lead] = await leadsOf(phone);
    const detail = await admin.get<LeadDetail>(`/leads/${lead?.id}`);
    expect(detail.latestEstimate).toBeNull();
  });

  it('"By campaign" counts the leads that got an estimate', async () => {
    const withEstimate = await estimated(uniquePhone());
    const phone = uniquePhone();
    await upToSite(phone);
    const [without] = await leadsOf(phone);
    for (const id of [withEstimate, without?.id]) {
      await rows('UPDATE leads SET campaign_code = $1 WHERE id = $2', [CODE, id]);
    }
    // A second estimate on the same lead does not count the lead twice.
    await rows(
      `INSERT INTO lead_estimates (lead_id, capacity_wp, module_count, total_paise, subsidy_paise,
                                   effective_paise, monthly_saving_paise, payback_years, answers, priced)
       SELECT lead_id, capacity_wp, module_count, total_paise, subsidy_paise, effective_paise,
              monthly_saving_paise, payback_years, answers, priced
         FROM lead_estimates WHERE lead_id = $1`,
      [withEstimate],
    );
    const report = await admin.get<SalesReport>('/business-reports/sales');
    expect(report.byCampaign.find((row) => row.key === CODE)).toMatchObject({
      leads: 2,
      estimates: 1,
    });
  });
});
