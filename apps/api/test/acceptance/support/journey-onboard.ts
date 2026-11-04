import { expect } from 'vitest';
import { rows } from './db';
import { EXTRAS, type JourneySetup, leadState } from './journey';
import type { Transcript } from './journey-transcript';
import { chatOf } from './onboarding';

/**
 * The journey's customer and campaign, and its first half (Steps 1-6: the Diwali ad to
 * "Call me back") walked again for the sale scenario, so one customer's transcript runs
 * from the first "Hi" to the receipt. Every check of these steps is in
 * 42-full-customer-journey; here only what the second half builds on is confirmed.
 */
export const JOURNEY = {
  code: 'DIWALI26',
  campaign: 'Diwali poster 2026',
  name: 'Ravi Patil (test)',
  ad: {
    source_id: 'ad-diwali-001',
    source_url: 'https://fb.me/oneohm-diwali',
    headline: 'Rooftop solar this Diwali',
  },
} as const;

export const setupLine = (j: JourneySetup) =>
  `Assignment: Pune → ${j.away.name} (on approved leave today) and ${j.owner.name}; campaign ${JOURNEY.code} = "${JOURNEY.campaign}"; onboarding on (Pune, Satara); template file and buttons approved for ${EXTRAS.join(', ')}.`;

/** What the lead looks like now, for an "Our side" line. */
async function leadLine(leadId: string): Promise<string> {
  const lead = await leadState(leadId);
  return `lead stage ${lead.stage}, category ${lead.subsidy_category}, size ${lead.estimated_wp ?? '—'} Wp, next action ${lead.next_action_on} "${lead.next_action_note}"`;
}

/** Steps 1-6 for the transcript's customer. Returns the lead's id. */
export async function onboardFromAd(t: Transcript, j: JourneySetup): Promise<string> {
  t.step('1. Setup (Settings)');
  t.ourSide(setupLine(j));

  t.step('2. Entry from the Diwali ad');
  await t.send({ text: `Hi OneOhm ${JOURNEY.code}`, referral: { ...JOURNEY.ad } });
  await t.tap('ob:language:mr');
  t.ourSide(
    `No lead yet. The chat keeps language ${(await chatOf(t.phone)).language}, ad ${JOURNEY.ad.source_id} and campaign ${JOURNEY.code}.`,
  );

  t.step('3. Onboarding questions (in Marathi)');
  await t.tap('ob:name:yes');
  await t.tap('ob:city:Pune');
  const [made] = await rows<{ id: string }>('SELECT id FROM leads WHERE phone_e164 = $1', [
    t.phone,
  ]);
  const leadId = made?.id ?? '';
  const lead = await leadState(leadId);
  expect(lead).toMatchObject({ owner_user_id: j.owner.id, campaign_code: JOURNEY.code });
  t.ourSide(
    `Lead made at the city answer: "${lead.name}", ${lead.city}, source ${lead.source}, campaign ${lead.campaign_code}, ad "${lead.ad_headline}"; owner ${j.owner.name} (${j.away.name} is on leave, so skipped); lead_assigned alert to ${j.owner.name}; ${await leadLine(leadId)}.`,
  );
  for (const id of ['ob:site:home', 'ob:bill:2000_3000', 'ob:roof:rcc', 'ob:floors:2'])
    await t.tap(id);
  t.ourSide(`Each answer wrote the lead and one history note: ${await leadLine(leadId)}.`);

  t.step('4–5. Bill photo, then the instant estimate');
  await t.send({ media: { type: 'image', fileId: 'journey-bill', mimeType: 'image/jpeg' } });
  const [estimate] = await rows<{ capacity_wp: number }>(
    'SELECT capacity_wp FROM lead_estimates WHERE lead_id = $1',
    [leadId],
  );
  expect(estimate).toBeTruthy();
  t.ourSide(
    `Bill photo filed on the lead as electricity_bill (no customer yet). Estimate ${estimate?.capacity_wp} Wp stored on the lead; ${await leadLine(leadId)}.`,
  );

  t.step('6. Call me back');
  await t.tap('ob:done:call');
  await t.tap('ob:done:call');
  t.ourSide(
    `${await leadLine(leadId)}; one whatsapp_callback alert to ${j.owner.name} (the second tap the same day adds none).`,
  );
  return leadId;
}
