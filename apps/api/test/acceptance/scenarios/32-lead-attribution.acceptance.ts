import type { LeadCampaignRecord } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

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

    // NONE is the report's no-campaign bucket, so it cannot be a code.
    const none = await admin.raw('POST', '/lead-campaigns', { code: 'none', name: 'Nothing' });
    expect(none.status).toBe(400);
    expect(none.text).toContain('NONE is kept');

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

    const columns = await rows<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' AND column_name = ANY($1)",
      [
        [
          'campaign_code',
          'ad_id',
          'ad_headline',
          'ad_source_url',
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'landing_page',
        ],
      ],
    );
    expect(columns).toHaveLength(8);
  });

  type Attribution = {
    source: string;
    campaign_code: string | null;
    ad_id: string | null;
    ad_headline: string | null;
    ad_source_url: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    landing_page: string | null;
  };
  const leadOf = async (phone: string) =>
    (
      await rows<Attribution>(
        `SELECT source, campaign_code, ad_id, ad_headline, ad_source_url, utm_source, utm_medium,
                utm_campaign, landing_page FROM leads WHERE phone_e164 = $1`,
        [phone],
      )
    )[0];

  it('website UTM fields land on the lead', async () => {
    const phone = uniquePhone();
    const sent = await new Session().raw('POST', '/public/leads', {
      name: 'Utm Visitor',
      phone,
      city: 'Pune',
      sourcePage: '/rooftop-solar',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'summer',
      campaignCode: 'web-1',
    });
    expect(sent.status).toBeLessThan(300);
    expect(await leadOf(phone)).toMatchObject({
      source: 'website',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'summer',
      campaign_code: 'WEB-1',
      landing_page: '/rooftop-solar',
    });
  });

  it('a WhatsApp ad referral then call-back makes a lead with adId, adHeadline and source whatsapp', async () => {
    const phone = uniquePhone();
    await sendInbound(phone, {
      text: 'Hi',
      referral: { source_id: 'ad-555', source_url: 'https://fb.me/x', headline: 'Solar offer' },
    });
    await sendInbound(phone, { buttonPayload: 'callback' });
    expect(await leadOf(phone)).toMatchObject({
      source: 'whatsapp',
      ad_id: 'ad-555',
      ad_headline: 'Solar offer',
      ad_source_url: 'https://fb.me/x',
      campaign_code: null,
    });
  });

  it('Hi OneOhm CODE then call-back stores campaignCode; a second code while the lead is open does not overwrite', async () => {
    const phone = uniquePhone();
    await sendInbound(phone, { text: 'Hi OneOhm diwali-acc' });
    const shown = await rows<{ n: string }>(
      `SELECT count(*) AS n FROM outbox WHERE recipient = $1 AND template = 'session:buttons'`,
      [phone],
    );
    expect(Number(shown[0]?.n)).toBe(1);
    await sendInbound(phone, { buttonPayload: 'callback' });
    expect((await leadOf(phone))?.campaign_code).toBe('DIWALI-ACC');
    await sendInbound(phone, { text: 'Hi OneOhm OTHER-9' });
    const [chat] = await rows<{ entry: unknown }>(
      `SELECT context->'entry' AS entry FROM wa_conversations WHERE phone = $1`,
      [phone],
    );
    expect(chat?.entry ?? null).toBeNull();
    await sendInbound(phone, { buttonPayload: 'callback' });
    expect((await leadOf(phone))?.campaign_code).toBe('DIWALI-ACC');
  });

  it('an unknown code is kept as typed', async () => {
    const phone = uniquePhone();
    await sendInbound(phone, { text: 'hello oneohm zz-unknown' });
    await sendInbound(phone, { buttonPayload: 'callback' });
    expect((await leadOf(phone))?.campaign_code).toBe('ZZ-UNKNOWN');
  });

  it('an ad entry survives staff handing a stranger chat back to the bot', async () => {
    const phone = uniquePhone();
    await sendInbound(phone, {
      text: 'Hi',
      referral: { source_id: 'ad-900', source_url: 'https://fb.me/y', headline: 'Roof offer' },
    });
    await sendInbound(phone, { buttonPayload: 'human' });
    const [chat] = await rows<{ id: string }>('SELECT id FROM wa_conversations WHERE phone = $1', [
      phone,
    ]);
    const released = await admin.raw('POST', `/whatsapp/chats/${chat?.id}/release`);
    expect(released.status).toBe(200);
    await sendInbound(phone, { buttonPayload: 'callback' });
    expect(await leadOf(phone)).toMatchObject({ ad_id: 'ad-900', ad_headline: 'Roof offer' });
  });
});
