import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, say, tap } from '../support/onboarding';
import { addDays, newCustomer, sellProject, today } from '../support/sales';
import { openChat, templatesFor } from '../support/send';
import { openMaintenance, templateOn } from '../support/visit-worker';
import { pickDay, setVisit, visitsFor, visitTask } from '../support/visits';

// AMC visits, a lead's survey and a Marathi customer (redesign §8).

const _alertsOf = (kind: string) =>
  rows<{ title: string; body: string }>('SELECT title, body FROM notifications WHERE kind = $1', [
    kind,
  ]);

describe('Visits: AMC, lead survey, Marathi', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('an AMC visit due: the customer picks a day, the team confirm; with the message off the older notice goes', async () => {
    const restore = await templateOn('visit_pick');
    try {
      const sale = await sellProject(admin, { name: 'Visit Amc (test)' });
      const { customer } = sale;
      const [plan] = await rows<{ id: string }>(
        `INSERT INTO amc_plans (name, price_paise, visits_per_year, duration_months, visit_name)
         VALUES ('AMC (test)', 100000, 2, 12, 'cleaning') RETURNING id`,
      );
      const [contract] = await rows<{ id: string }>(
        `INSERT INTO amc_contracts (project_id, customer_id, plan_id, plan_name, visit_name, visits_per_year, starts_on, ends_on, price_paise)
         VALUES ($1, $2, $3, 'AMC (test)', 'cleaning', 2, $4, $5, 100000) RETURNING id`,
        [sale.project.id, customer.customerId, plan?.id, today(), addDays(today(), 365)],
      );
      await rows('INSERT INTO amc_visits (contract_id, position, due_on) VALUES ($1, 1, $2)', [
        contract?.id,
        addDays(today(), 3),
      ]);
      expect(await openMaintenance(today())).toBeGreaterThanOrEqual(1);
      const [ask] = await templatesFor(customer.phone, 'visit_pick');
      expect(ask?.payload).toMatchObject({
        work: 'free AMC visit',
        pickPayload: expect.stringMatching(/^vask:/),
      });
      expect(await templatesFor(customer.phone, 'maintenance_visit')).toHaveLength(0);
      await tap(customer.phone, String(ask?.payload.pickPayload));
      const list = await lastReply(customer.phone);
      expect(list?.body).toMatch(/^Your free AMC visit for \*.+\* is due\. Pick a day:$/);
      await pickDay(customer.phone, list);
      const [proposed] = await visitsFor(customer.customerId);
      expect(proposed).toMatchObject({ kind: 'amc', status: 'proposed' });
      const [request] = await rows<{ id: string }>(
        'SELECT service_request_id AS id FROM amc_visits WHERE contract_id = $1',
        [contract?.id],
      );
      const confirmed = await setVisit(admin, {
        serviceRequestId: request?.id ?? '',
        day: proposed?.day ?? '',
        slot: proposed?.slot ?? '',
      });
      expect(confirmed).toMatchObject({ kind: 'amc', status: 'confirmed' });
      const [mirror] = await rows<{ visit_on: string }>(
        'SELECT visit_on::text FROM service_requests WHERE id = $1',
        [request?.id],
      );
      expect(mirror?.visit_on).toBe(proposed?.day);

      // With the message off, the customer hears the older notice and no pick is asked.
      await templateOn('visit_pick', false);
      const plain = await sellProject(admin, { name: 'Visit Amc Plain (test)' });
      const [contract2] = await rows<{ id: string }>(
        `INSERT INTO amc_contracts (project_id, customer_id, plan_id, plan_name, visit_name, visits_per_year, starts_on, ends_on, price_paise)
         VALUES ($1, $2, $3, 'AMC (test)', 'cleaning', 2, $4, $5, 100000) RETURNING id`,
        [plain.project.id, plain.customer.customerId, plan?.id, today(), addDays(today(), 365)],
      );
      await rows('INSERT INTO amc_visits (contract_id, position, due_on) VALUES ($1, 1, $2)', [
        contract2?.id,
        addDays(today(), 4),
      ]);
      await openMaintenance(today());
      expect(await templatesFor(plain.customer.phone, 'maintenance_visit')).toHaveLength(1);
      expect(await templatesFor(plain.customer.phone, 'visit_pick')).toHaveLength(0);
    } finally {
      await restore();
    }
  });

  it('a lead survey: asked from the lead, picked, confirmed - the lead is Survey scheduled with the day as its next action', async () => {
    const customer = await newCustomer(admin, { name: 'Visit Lead (test)' });
    await openChat(customer.phone, customer.customerId);
    const scope = { leadId: customer.leadId };
    const options = await admin.get<{ offers: { action: string }[] }>(
      `/send-to-customer/options?leadId=${customer.leadId}`,
    );
    expect(options.offers.some((offer) => offer.action === 'ask_visit')).toBe(true);
    await admin.post('/send-to-customer', { scope, request: { action: 'ask_visit', ...scope } });
    const list = await lastReply(customer.phone);
    expect(list?.body).toMatch(/for the \*site survey\*\?$/);
    // Home keeps the ask until it is answered.
    await say(customer.phone, 'hi');
    expect(
      (await lastReply(customer.phone))?.buttons?.some((button) => button.id.startsWith('vask:')),
    ).toBe(true);
    const { day } = await pickDay(customer.phone, list, 'afternoon');
    const [lead] = await rows<{ stage: string; next_action_on: string }>(
      'SELECT stage::text, next_action_on::text FROM leads WHERE id = $1',
      [customer.leadId],
    );
    expect(lead).toMatchObject({ stage: 'survey_scheduled', next_action_on: day });
    const confirmed = await setVisit(admin, { leadId: customer.leadId, day, slot: 'afternoon' });
    expect(confirmed).toMatchObject({
      kind: 'survey',
      status: 'confirmed',
      leadId: customer.leadId,
    });
    expect((await lastReply(customer.phone))?.body).toMatch(/^Booked ✅/);
    // Home: a visit in the next 3 days reads the visit record.
    await say(customer.phone, 'hi');
    const home = await lastReply(customer.phone);
    expect(home?.body).toMatch(/Our team visits your .+home on \*.+\*\./);
    expect(home?.buttons?.some((button) => button.id === 'go:visit')).toBe(true);
    const [note] = await rows(
      "SELECT 1 FROM lead_activities WHERE lead_id = $1 AND note LIKE 'Moved to Survey scheduled%'",
      [customer.leadId],
    );
    expect(note).toBeDefined();
  });

  it('speaks Marathi to a Marathi customer', async () => {
    const sale = await sellProject(admin, { name: 'Visit Marathi (test)' });
    const { customer } = sale;
    await rows("UPDATE customers SET preferred_language = 'mr-IN' WHERE id = $1", [
      customer.customerId,
    ]);
    const task = await visitTask(sale, 'site_survey');
    await openChat(customer.phone, customer.customerId);
    await admin.post('/send-to-customer', {
      scope: { taskId: task },
      request: { action: 'ask_visit', taskId: task },
    });
    const list = await lastReply(customer.phone);
    expect(list?.body).toMatch(/साईट सर्व्हे/);
    expect(list?.button).toBe('दिवस निवडा');
    const { day } = await pickDay(customer.phone, list);
    expect((await lastReply(customer.phone))?.body).toMatch(/^धन्यवाद — आम्ही/);
    await setVisit(admin, { taskId: task, day, slot: 'morning' });
    const booked = await lastReply(customer.phone);
    expect(booked?.body).toMatch(/^ठरले ✅/);
    expect(booked?.buttons?.map((button) => button.title)).toEqual(['ठीक आहे', 'दिवस बदला']);
  });
});
