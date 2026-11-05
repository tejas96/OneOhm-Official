import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amcEnding, planId, renewalAsks } from '../support/amc';
import { bodyOf, callTasks, PROMISE } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { setTemplate } from '../support/journey-steps';
import { lastReply, say, tap } from '../support/onboarding';
import { sellProject, today } from '../support/sales';
import { closeChat, openChat, optionsOf, sendTo, templatesFor } from '../support/send';
import { offerRenewals } from '../support/visit-worker';
import { sendInbound } from '../support/whatsapp';

// AMC renewal (redesign §4, phase 6): an offer 30 days before the end (marketing, skipped after STOP) with
// [Renew AMC] and [Talk to us]; the staff action "AMC renewal offer".

describe('AMC: renewal offer', () => {
  let admin: Session;
  let plan: string;
  let undoTemplate: () => Promise<unknown>;
  beforeAll(async () => {
    admin = await Session.admin();
    plan = await planId();
    // The offer is made once Meta has approved the template (the switch is on).
    undoTemplate = await setTemplate('amc_renewal_offer', true);
  });
  afterAll(async () => {
    await undoTemplate();
    await closeDb();
  });

  it('goes to an AMC ending within 30 days, once, as the marketing template with both buttons', async () => {
    const sale = await sellProject(admin, { name: 'Amc Offer (test)' });
    const contract = await amcEnding(sale, 20, plan);
    const far = await sellProject(admin, { name: 'Amc Far (test)' });
    await amcEnding(far, 90, plan);
    await offerRenewals(today());
    const [ask] = await renewalAsks(sale.customer.customerId);
    expect(ask).toMatchObject({ status: 'open' });
    expect(ask?.payload).toMatchObject({ contractId: contract, once: `amc_renewal:${contract}` });
    const [sent] = await templatesFor(sale.customer.phone, 'amc_renewal_offer');
    expect(sent?.payload).toMatchObject({
      renewPayload: `amc:renew:${ask?.id}`,
      talkPayload: `amc:talk:${ask?.id}`,
    });
    // Once: a second morning makes no second offer; a contract ending in 90 days is not offered yet.
    await offerRenewals(today());
    expect(await renewalAsks(sale.customer.customerId)).toHaveLength(1);
    expect(await templatesFor(sale.customer.phone, 'amc_renewal_offer')).toHaveLength(1);
    expect(await renewalAsks(far.customer.customerId)).toHaveLength(0);
  });

  it('skips a customer who said STOP, and offers after START; skips a cancelled or already renewed AMC', async () => {
    const stopped = await sellProject(admin, { name: 'Amc Stop (test)' });
    await amcEnding(stopped, 10, plan);
    await openChat(stopped.customer.phone, stopped.customer.customerId);
    await say(stopped.customer.phone, 'STOP');
    await offerRenewals(today());
    expect(await renewalAsks(stopped.customer.customerId)).toHaveLength(0);
    expect(await templatesFor(stopped.customer.phone, 'amc_renewal_offer')).toHaveLength(0);
    await say(stopped.customer.phone, 'START');
    await offerRenewals(today());
    expect(await renewalAsks(stopped.customer.customerId)).toHaveLength(1);

    const cancelled = await sellProject(admin, { name: 'Amc Cancelled (test)' });
    const contract = await amcEnding(cancelled, 10, plan);
    await rows('UPDATE amc_contracts SET cancelled_at = now() WHERE id = $1', [contract]);
    const renewed = await sellProject(admin, { name: 'Amc Renewed (test)' });
    await amcEnding(renewed, 10, plan);
    await amcEnding(renewed, 370, plan);
    await offerRenewals(today());
    expect(await renewalAsks(cancelled.customer.customerId)).toHaveLength(0);
    expect(await renewalAsks(renewed.customer.customerId)).toHaveLength(0);
  });

  it('[Renew AMC] promises a call, makes a call task and tells the person; a second tap changes nothing', async () => {
    const sale = await sellProject(admin, { name: 'Amc Renew (test)' });
    await amcEnding(sale, 15, plan);
    await offerRenewals(today());
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    const [ask] = await renewalAsks(sale.customer.customerId);
    await tap(phone, `amc:renew:${ask?.id}`);
    const body = await bodyOf(phone);
    expect(body).toMatch(/^Thank you! \*.+\* will call you .* to renew your AMC\.$/);
    expect(body).toMatch(PROMISE);
    expect((await renewalAsks(sale.customer.customerId))[0]?.status).toBe('closed');
    const [task] = await callTasks(sale.customer.customerId);
    expect(task).toMatchObject({ status: 'received' });
    expect(task?.payload.reason).toBe('amc');
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'call_customer' AND dedupe_key LIKE $1",
      [`amc_renew:${ask?.id}%`],
    );
    expect(alerts.length).toBeGreaterThan(0);
    await tap(phone, `amc:renew:${ask?.id}`);
    expect(await bodyOf(phone)).toBe('This offer is closed. Thank you!');
    expect(await callTasks(sale.customer.customerId)).toHaveLength(1);
  });

  it('an open offer is not a roof question on Home, and the cancel words name the AMC', async () => {
    const sale = await sellProject(admin, { name: 'Amc Home (test)' });
    await amcEnding(sale, 15, plan);
    await offerRenewals(today());
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, 'menu');
    expect((await lastReply(sale.customer.phone))?.body ?? '').not.toMatch(/roof/i);
    const [ask] = await renewalAsks(sale.customer.customerId);
    await admin.post(`/document-requests/${ask?.id}/cancel`, {});
    expect(await bodyOf(sale.customer.phone)).toContain('AMC renewal');
    expect((await renewalAsks(sale.customer.customerId))[0]?.status).toBe('cancelled');
  });

  it('[Talk to us] hands the chat to their person and closes the offer', async () => {
    const sale = await sellProject(admin, { name: 'Amc Talk (test)' });
    await amcEnding(sale, 15, plan);
    await offerRenewals(today());
    await openChat(sale.customer.phone, sale.customer.customerId);
    const [ask] = await renewalAsks(sale.customer.customerId);
    await tap(sale.customer.phone, `amc:talk:${ask?.id}`);
    const [chat] = await rows<{ state: string }>(
      'SELECT state FROM wa_conversations WHERE phone = $1',
      [sale.customer.phone],
    );
    expect(chat?.state).toBe('human');
    expect((await renewalAsks(sale.customer.customerId))[0]?.payload.answer).toBe('talk');
  });

  it('works while a person holds the chat (it is the customer using the assistant)', async () => {
    const sale = await sellProject(admin, { name: 'Amc Held (test)' });
    await amcEnding(sale, 15, plan);
    await offerRenewals(today());
    await openChat(sale.customer.phone, sale.customer.customerId);
    await rows("UPDATE wa_conversations SET state = 'human' WHERE phone = $1", [
      sale.customer.phone,
    ]);
    const [ask] = await renewalAsks(sale.customer.customerId);
    await sendInbound(sale.customer.phone, { buttonReply: `amc:renew:${ask?.id}` });
    expect((await renewalAsks(sale.customer.customerId))[0]?.status).toBe('closed');
  });

  it('staff offer it from the project: chat buttons in 24 hours, the template outside; one offer per AMC', async () => {
    const sale = await sellProject(admin, { name: 'Amc Staff (test)' });
    const contract = await amcEnding(sale, 40, plan);
    await openChat(sale.customer.phone, sale.customer.customerId);
    const scope = { projectId: sale.project.id };
    const offers = (await optionsOf(admin, scope)).offers.filter((o) => o.action === 'amc_renewal');
    expect(offers).toHaveLength(1);
    expect(offers[0]?.preview?.buttons).toHaveLength(2);
    await sendTo(admin, scope, { action: 'amc_renewal', contractId: contract });
    const offer = await lastReply(sale.customer.phone);
    expect(offer?.body).toMatch(/^The annual maintenance plan for your .* solar ends on /);
    expect(offer?.buttons?.map((b) => b.title)).toEqual([
      'Renew AMC',
      expect.stringMatching(/^Talk to /),
    ]);
    const [ask] = await renewalAsks(sale.customer.customerId);
    expect(offer?.buttons?.[0]?.id).toBe(`amc:renew:${ask?.id}`);
    const again = await admin.raw('POST', '/send-to-customer', {
      scope,
      request: { action: 'amc_renewal', contractId: contract },
    });
    expect(again.status).toBe(409);
    // The morning job finds the team's offer and makes no second one.
    await offerRenewals(addDaysToday(15));
    expect(await renewalAsks(sale.customer.customerId)).toHaveLength(1);

    const closed = await sellProject(admin, { name: 'Amc Staff Template (test)' });
    const other = await amcEnding(closed, 25, plan);
    await openChat(closed.customer.phone, closed.customer.customerId);
    await closeChat(closed.customer.phone);
    await sendTo(
      admin,
      { projectId: closed.project.id },
      { action: 'amc_renewal', contractId: other },
    );
    const [sent] = await templatesFor(closed.customer.phone, 'amc_renewal_offer');
    expect(sent?.payload.renewPayload).toMatch(/^amc:renew:/);
  });

  it('in Marathi', async () => {
    const sale = await sellProject(admin, { name: 'Amc Marathi (test)' });
    const contract = await amcEnding(sale, 12, plan);
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, 'lang:mr');
    await sendTo(
      admin,
      { projectId: sale.project.id },
      { action: 'amc_renewal', contractId: contract },
    );
    const offer = await lastReply(sale.customer.phone);
    expect(offer?.body).toContain('वार्षिक देखभाल योजना');
    expect(offer?.buttons?.[0]?.title).toBe('AMC नूतनीकरण');
    const [ask] = await renewalAsks(sale.customer.customerId);
    await tap(sale.customer.phone, `amc:renew:${ask?.id}`);
    expect(await bodyOf(sale.customer.phone)).toContain('AMC नूतनीकरणासाठी');
  });
});

/** Today plus some days, as the worker's morning date. */
function addDaysToday(days: number) {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
