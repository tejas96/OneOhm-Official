import type { LeadCampaignRecord } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';

// Part 2, task 4: the owner keeps a list of ad and campaign codes (Settings → Selling).
// Codes are stored uppercase, a name can change, a code can be turned off, and the same
// code cannot be added twice. Leads gain attribution columns (all empty until captured).
const CODE = 'DIWALI-ACC';

describe('Lead attribution', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
    await rows('DELETE FROM lead_campaigns WHERE code = $1', [CODE]);
  });
  afterAll(async () => {
    await rows('DELETE FROM lead_campaigns WHERE code = $1', [CODE]);
    await closeDb();
  });

  const find = (list: LeadCampaignRecord[]) => list.find((campaign) => campaign.code === CODE);

  it('adds, renames and turns off a campaign code; codes are stored uppercase; a duplicate code is refused', async () => {
    const added = await admin.post<LeadCampaignRecord[]>('/lead-campaigns', {
      code: ` ${CODE.toLowerCase()} `,
      name: 'Diwali ads',
    });
    expect(find(added)).toMatchObject({ code: CODE, name: 'Diwali ads', active: true });

    const [stored] = await rows<{ code: string }>(
      'SELECT code FROM lead_campaigns WHERE code = $1',
      [CODE],
    );
    expect(stored?.code).toBe(CODE);

    const duplicate = await admin.raw('POST', '/lead-campaigns', {
      code: CODE.toLowerCase(),
      name: 'Again',
    });
    expect(duplicate.status).toBe(409);

    const badCode = await admin.raw('POST', '/lead-campaigns', { code: 'a b!', name: 'Bad' });
    expect(badCode.status).toBe(400);

    const renamed = await admin.patch<LeadCampaignRecord[]>(`/lead-campaigns/${CODE}`, {
      name: 'Diwali 2026',
    });
    expect(find(renamed)).toMatchObject({ name: 'Diwali 2026', active: true });

    const off = await admin.patch<LeadCampaignRecord[]>(`/lead-campaigns/${CODE}`, {
      active: false,
    });
    expect(find(off)?.active).toBe(false);
    expect(find(await admin.get<LeadCampaignRecord[]>('/lead-campaigns'))?.active).toBe(false);

    const missing = await admin.raw('PATCH', '/lead-campaigns/NOPE-NOT-HERE', { active: true });
    expect(missing.status).toBe(404);

    const [audited] = await rows<{ n: string }>(
      "SELECT count(*) AS n FROM audit_log WHERE entity_id = $1 AND action LIKE 'lead_campaign.%'",
      [CODE],
    );
    expect(Number(audited?.n)).toBe(3);

    const [lead] = await rows<Record<string, unknown>>(
      'SELECT campaign_code, ad_id, ad_headline, ad_source_url, utm_source, utm_medium, utm_campaign, landing_page FROM leads LIMIT 1',
    );
    if (lead) expect(Object.values(lead).every((value) => value === null)).toBe(true);
  });
});
