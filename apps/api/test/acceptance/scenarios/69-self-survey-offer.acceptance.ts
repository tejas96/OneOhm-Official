import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, replies, tap } from '../support/onboarding';
import { newCustomer, sellProject } from '../support/sales';
import { offerSurvey, setOffer, surveysOf, surveyTask } from '../support/self-survey';
import { closeChat, openChat, optionsOf, sendTo } from '../support/send';
import { visitTask } from '../support/visits';

// The self site survey offer (redesign §7): only with a project and the setting on, from Send to
// customer and from Home, with the credit in the words.

describe('Self survey: the offer', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('the team offers it from the survey step: ₹1,000 off, [Start survey] [Book a visit instead]', async () => {
    const sale = await sellProject(admin, { name: 'Survey Offer (test)' });
    const taskId = await surveyTask(sale);
    await openChat(sale.customer.phone, sale.customer.customerId);
    const options = await optionsOf(admin, { taskId });
    const offer = options.offers.find((one) => one.action === 'self_survey');
    expect(offer?.preview?.body).toBe(
      'Do your own site survey in 5 minutes and get *₹1,000 off* your next payment. Our engineer checks your photos - no visit needed.',
    );
    expect(offer?.preview?.buttons).toEqual(['Start survey', 'Book a visit instead']);
    const { ask } = await offerSurvey(admin, sale);
    expect(ask).toMatchObject({ status: 'open' });
    expect(ask.payload.offerPaise).toBe(100_000);
    const reply = await lastReply(sale.customer.phone);
    expect(reply?.buttons?.map((b) => b.id)).toEqual([`ss:go:${ask.id}`, `ss:visit:${ask.id}`]);
    // Offered once: the sheet lists nothing more and a second send is refused.
    const again = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId },
      request: { action: 'self_survey', taskId },
    });
    expect(again.status).toBe(409);
  });

  it('the words follow the language (Marathi)', async () => {
    const sale = await sellProject(admin, { name: 'Survey Marathi (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, 'lang:mr');
    await offerSurvey(admin, sale);
    const reply = await lastReply(sale.customer.phone);
    expect(reply?.body).toContain('₹1,000 सूट');
    expect(reply?.buttons?.map((b) => b.title)).toEqual(['सर्वे सुरू करा', 'भेट बुक करा']);
  });

  it('never on a lead: no offer, no action', async () => {
    const customer = await newCustomer(admin, { name: 'Survey Lead (test)' });
    const options = await optionsOf(admin, { leadId: customer.leadId });
    expect(options.offers.filter((one) => one.action === 'self_survey')).toEqual([]);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope: { leadId: customer.leadId },
      request: { action: 'self_survey', taskId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(refused.status).toBeGreaterThanOrEqual(400);
  });

  it('with the setting off there is no offer anywhere, and the amount follows Settings', async () => {
    const sale = await sellProject(admin, { name: 'Survey Off (test)' });
    const taskId = await surveyTask(sale);
    await openChat(sale.customer.phone, sale.customer.customerId);
    const back = await setOffer(admin, { selfSurveyOffer: false });
    try {
      expect(
        (await optionsOf(admin, { taskId })).offers.filter((one) => one.action === 'self_survey'),
      ).toEqual([]);
      const refused = await admin.raw('POST', '/send-to-customer', {
        scope: { taskId },
        request: { action: 'self_survey', taskId },
      });
      expect(refused.status).toBe(409);
      await tap(sale.customer.phone, 'menu');
      expect((await lastReply(sale.customer.phone))?.body ?? '').not.toContain('site survey');
    } finally {
      await back();
    }
    const other = await setOffer(admin, { selfSurveyPaise: 250_000 });
    try {
      const offer = (await optionsOf(admin, { taskId })).offers.find(
        (one) => one.action === 'self_survey',
      );
      expect(offer?.preview?.body).toContain('₹2,500 off');
    } finally {
      await other();
    }
    const bad = await admin.raw('PUT', '/settings/reminders', {
      ...(await admin.get<Record<string, unknown>>('/settings/reminders')),
      selfSurveyPaise: 150,
    });
    expect(bad.status).toBe(400);
  });

  it('outside 24 hours it is the (inactive) marketing template, with both buttons', async () => {
    const sale = await sellProject(admin, { name: 'Survey Template (test)' });
    const taskId = await surveyTask(sale);
    await openChat(sale.customer.phone, sale.customer.customerId);
    await closeChat(sale.customer.phone);
    await sendTo(admin, { taskId }, { action: 'self_survey', taskId });
    const [ask] = await surveysOf(sale.customer.customerId);
    const sent = (await outboxFor(sale.customer.phone)).filter(
      (row) => row.template === 'self_survey_offer',
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({
      amount: '₹1,000',
      startPayload: `ss:go:${ask?.id}`,
      visitPayload: `ss:visit:${ask?.id}`,
    });
    const [template] = await rows<{ active: boolean }>(
      "SELECT active FROM message_templates WHERE key = 'self_survey_offer'",
    );
    expect(template?.active).toBe(false);
    expect((await replies(sale.customer.phone)).some((r) => r.body?.includes('site survey'))).toBe(
      false,
    );
  });

  it('Home offers it at the survey stage; Start survey makes the ask; a booked visit hides it', async () => {
    const sale = await sellProject(admin, { name: 'Survey Home (test)' });
    await settleAdvance(sale.project.id);
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, 'menu');
    const home = await lastReply(sale.customer.phone);
    expect(home?.body).toContain('*₹1,000 off*');
    expect(home?.buttons?.map((b) => b.title)).toEqual([
      'Start survey',
      'Book a visit instead',
      'More',
    ]);
    expect(await surveysOf(sale.customer.customerId)).toHaveLength(0);
    await tap(sale.customer.phone, home?.buttons?.[0]?.id ?? '');
    const [ask] = await surveysOf(sale.customer.customerId);
    expect(ask).toMatchObject({ status: 'open' });
    expect(ask?.payload.startedAt).not.toBeNull();

    // A booked visit for the survey step takes the offer away.
    const booked = await sellProject(admin, { name: 'Survey Home Visit (test)' });
    await settleAdvance(booked.project.id);
    const taskId = await visitTask(booked, 'site_survey', admin.userId);
    await openChat(booked.customer.phone, booked.customer.customerId);
    await admin.post('/visits', { taskId, day: nextWorkingDay(), slot: 'morning' });
    await tap(booked.customer.phone, 'menu');
    expect((await lastReply(booked.customer.phone))?.body ?? '').not.toContain('site survey');
  });
});

/** The advance is paid (so Home has no payment to put first). */
const settleAdvance = (projectId: string) =>
  rows("UPDATE payment_milestones SET status = 'paid' WHERE project_id = $1 AND status = 'due'", [
    projectId,
  ]);

/** A Monday-to-Saturday day a few days ahead. */
function nextWorkingDay(): string {
  const day = new Date(Date.now() + 3 * 86_400_000);
  if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
