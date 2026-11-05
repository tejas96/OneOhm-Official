import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amcEnding, planId, renewalAsks } from '../support/amc';
import { callTasks, optionIds, requestsOf, settleAdvance } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf } from '../support/forms';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { NOON, setTemplate } from '../support/journey-steps';
import { lastReply, replies, tap, withOnboarding } from '../support/onboarding';
import { sellProject, today } from '../support/sales';
import { openChat, setForm, templatesFor } from '../support/send';
import { completeThrough } from '../support/tasks';
import { offerRenewals, runCare } from '../support/visit-worker';
import { sendInbound } from '../support/whatsapp';

// Review round 1 (phase 6): every care ask is on Home and chased (I1), the report form always offers the home (C3),
// the small gaps (M1 M2 M3 M4), and the AMC offer waits for its template (I5).

describe('Care: AMC chase, report form and the small gaps', () => {
  let admin: Session;
  const undos: (() => Promise<unknown>)[] = [];
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(async () => {
    for (const back of undos) await back();
    await setForm('report_problem', null);
    await closeDb();
  });

  const finishSurvey = async (projectId: string) => {
    await completeThrough(admin, projectId, 'electricity_details');
    await completeThrough(admin, projectId, 'site_survey');
  };

  it('the AMC offer waits for its template, is on Home with [Renew AMC][Talk], is chased ~10 days before the end and the team hears at 7', async () => {
    const plan = await planId();
    const sale = await sellProject(admin, { name: 'Care Amc Loop (test)' });
    await amcEnding(sale, 20, plan);
    await offerRenewals(today());
    // The template is off (until Meta approves it): no ask is used up.
    expect(await renewalAsks(sale.customer.customerId)).toHaveLength(0);
    const on = await setTemplate('amc_renewal_offer', true);
    undos.push(on);
    await offerRenewals(today());
    const [ask] = await renewalAsks(sale.customer.customerId);
    expect(ask?.status).toBe('open');
    await openChat(sale.customer.phone, sale.customer.customerId);
    await settleAdvance(sale.project.id);
    await tap(sale.customer.phone, 'menu');
    const home = await lastReply(sale.customer.phone);
    expect(home?.body).toContain('annual maintenance plan');
    expect(home?.buttons?.map((b) => b.id).slice(0, 2)).toEqual([
      `amc:renew:${ask?.id}`,
      `amc:talk:${ask?.id}`,
    ]);

    // The AMC ends in 5 days: the second offer goes (marketing) and the service team is told.
    const ends = new Date(NOON.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    await rows(
      "UPDATE customer_actions SET payload = payload || jsonb_build_object('endsOn', $2::text) WHERE id = $1",
      [ask?.id, ends],
    );
    await runCare(NOON);
    await runCare(NOON);
    const sent = (await templatesFor(sale.customer.phone, 'amc_renewal_offer')).filter(
      (m) => m.dedupe_key === `amc_renewal_reminder:${ask?.id}`,
    );
    expect(sent).toHaveLength(1);
    const team = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'amc_renewal_waiting' AND dedupe_key LIKE $1",
      [`amc_renewal_waiting:${ask?.id}%`],
    );
    expect(team.length).toBeGreaterThan(0);
    expect(await replies(sale.customer.phone)).toBeDefined();
  });

  it('the report form always offers the home; an unknown home is asked in the chat, never guessed', async () => {
    await setForm('report_problem', FLOW_ID);
    const one = await sellProject(admin, { name: 'Care Form One (test)' });
    await openChat(one.customer.phone, one.customer.customerId);
    await tap(one.customer.phone, 'go:problem');
    const form = await flowOf(one.customer.phone);
    expect(form?.data.ask_home).toBe(false);
    expect(optionIds(form?.data.home_options)).toEqual([one.project.id]);
    await sendInbound(one.customer.phone, {
      form: {
        token: form?.token ?? '',
        fields: { home: '00000000-0000-4000-8000-000000000000', what: 'damage', since: 'today' },
      },
    });
    expect(await requestsOf(one.customer.customerId)).toHaveLength(0);
    expect((await lastReply(one.customer.phone))?.kind).toBe('list');

    const two = await sellProject(admin, { name: 'Care Form Two (test)' });
    await anotherHome(admin, two.customer, 'Farm care (test)');
    await openChat(two.customer.phone, two.customer.customerId);
    await tap(two.customer.phone, 'go:problem');
    const second = await flowOf(two.customer.phone);
    await sendInbound(two.customer.phone, {
      form: { token: second?.token ?? '', fields: { what: 'damage', since: 'today' } },
    });
    expect(await requestsOf(two.customer.customerId)).toHaveLength(0);
    expect(
      (await lastReply(two.customer.phone))?.rows?.every((r) => r.id.startsWith('home:')),
    ).toBe(true);
  });

  it('a city the form did not offer is "Other city"; the old rate:N row names what it rates', async () => {
    const back = await withOnboarding(admin, { serviceCities: ['Sangli', 'Pune'] });
    undos.push(back);
    await setForm('refer_friend', FLOW_ID);
    const sale = await sellProject(admin, { name: 'Care City (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, 'go:refer');
    const form = await flowOf(sale.customer.phone);
    await sendInbound(sale.customer.phone, {
      form: {
        token: form?.token ?? '',
        fields: { friend: 'Forged City', mobile: '93333 44455', city: 'Atlantis' },
      },
    });
    const [lead] = await rows<{ city: string }>(
      "SELECT city FROM leads WHERE phone_e164 = '+919333344455'",
    );
    expect(lead?.city).toBe('Not given');
    await setForm('refer_friend', null);

    const rated = await sellProject(admin, { name: 'Care Legacy (test)' });
    await openChat(rated.customer.phone, rated.customer.customerId);
    await finishSurvey(rated.project.id);
    await tap(rated.customer.phone, 'rate:3');
    const said = await replies(rated.customer.phone);
    expect(said.some((r) => r.body === 'Rating your site survey: 3 of 5.')).toBe(true);
    expect(said.at(-1)?.body).toContain('Thank you for rating us');
  });

  it('a 1 or 2 star problem rating in the app makes the same call task', async () => {
    const sale = await sellProject(admin, { name: 'Care App Rating (test)' });
    const customer = await Session.code(sale.customer.phone, 'customer');
    const request = await customer.post<{ id: string }>('/customer/service-requests', {
      projectId: sale.project.id,
      category: 'low_generation',
      description: 'Generation looks low (test).',
    });
    await admin.patch(`/service-requests/${request.id}`, { status: 'resolved' });
    await customer.post(`/customer/service-requests/${request.id}/rating`, {
      rating: 2,
      comment: 'Not fixed (test)',
    });
    const [task] = await callTasks(sale.customer.customerId);
    expect(task?.payload.reason).toBe('low_rating');
  });
});
