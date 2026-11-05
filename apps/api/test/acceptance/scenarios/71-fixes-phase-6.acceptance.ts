import type { ReferralReward } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asksOfKind, filesOn, requestsOf } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf, photo } from '../support/forms';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { NOON, setTemplate } from '../support/journey-steps';
import { lastReply, say, tap } from '../support/onboarding';
import { earnedReward, programOn } from '../support/referral';
import { sellProject } from '../support/sales';
import { openChat, setForm, templatesFor } from '../support/send';
import { runCare, runChecks } from '../support/visit-worker';
import { sendInbound } from '../support/whatsapp';

// Phase 6 leftovers (phase 7 "fix first"): payout asks close with their reward, the check goes to finance,
// a second resolve is checked again, payout rounds count from the latest ask, the form's photos survive.

const DAY = 86_400_000;

describe('Phase 6 leftovers', () => {
  let admin: Session;
  const undos: (() => Promise<unknown>)[] = [];
  beforeAll(async () => {
    admin = await Session.admin();
    undos.push(await programOn(admin), await setTemplate('reward_upi_ask', true));
  });
  afterAll(async () => {
    for (const back of undos) await back();
    await setForm('report_problem', null);
    await closeDb();
  });

  async function approved(name: string) {
    const { referrer, reward } = await earnedReward(admin, name);
    await openChat(referrer.customer.phone, referrer.customer.customerId);
    await admin.post<ReferralReward>(`/referral-rewards/${reward.id}/approve`, {});
    const [ask] = await asksOfKind(referrer.customer.customerId, 'payout');
    return {
      phone: referrer.customer.phone,
      customerId: referrer.customer.customerId,
      id: reward.id,
      ask,
    };
  }

  it('0a: a reward paid another way closes the ask: no reminder, no finance alert, no Home line', async () => {
    const { phone, customerId, id, ask } = await approved('Fix Paid Bank');
    const paid = await admin.raw('POST', `/referral-rewards/${id}/pay`, {
      method: 'bank_transfer',
      paidOn: new Date().toISOString().slice(0, 10),
      reference: 'UTR-71',
    });
    expect(paid.status).toBe(200);
    expect((await asksOfKind(customerId, 'payout'))[0]?.status).toBe('closed');
    // Even an ask that were still open is not chased for a reward that is paid.
    await rows("UPDATE customer_actions SET status = 'open', created_at = $2 WHERE id = $1", [
      ask?.id,
      new Date(NOON.getTime() - 3 * DAY),
    ]);
    await runCare(NOON);
    const chased = (await templatesFor(phone, 'reward_upi_ask')).filter((m) =>
      m.dedupe_key.startsWith('payout_reminder:'),
    );
    expect(chased).toHaveLength(0);
    const alerts = await rows('SELECT 1 FROM notifications WHERE dedupe_key LIKE $1', [
      `upi_waiting:${ask?.id}%`,
    ]);
    expect(alerts).toHaveLength(0);
    await rows("UPDATE customer_actions SET status = 'closed' WHERE id = $1", [ask?.id]);
    await tap(phone, 'menu');
    expect((await lastReply(phone))?.body ?? '').not.toContain('UPI');
  });

  it('0b: the "received, to check" alert goes to people who record payments', async () => {
    const { phone, customerId, ask } = await approved('Fix Check Alert');
    await tap(phone, `up:go:${ask?.id}`);
    await say(phone, 'fix.check@ybl');
    await rows('UPDATE customer_actions SET done_at = $2, updated_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(NOON.getTime() - 3 * DAY),
    ]);
    await runChecks(NOON);
    const told = await rows<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM user_roles ur JOIN role_capabilities rc ON rc.role_id = ur.role_id
          WHERE ur.user_id = n.user_id AND rc.capability = 'finance.record_payments') AS ok
         FROM notifications n WHERE n.dedupe_key LIKE $1`,
      [`action_check:${ask?.id}:%`],
    );
    expect(told.length).toBeGreaterThan(0);
    expect(told.every((row) => row.ok)).toBe(true);
    expect(customerId).toBeTruthy();
  });

  it('0e: after Ask again the reminder rounds count from the new ask', async () => {
    const { phone, customerId, id, ask } = await approved('Fix Rounds');
    await tap(phone, `up:go:${ask?.id}`);
    await say(phone, 'rounds@ybl');
    await admin.post(`/referral-rewards/${id}/upi-check`, {
      result: 'again',
      reason: 'Unclear',
      upiId: 'rounds@ybl',
    });
    // The ask was made long ago, asked again only now: no reminder yet.
    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(NOON.getTime() - 9 * DAY),
    ]);
    await rows(
      "UPDATE customer_actions SET payload = payload || jsonb_build_object('askedAt', $2::text) WHERE id = $1",
      [ask?.id, NOON.toISOString()],
    );
    await runCare(NOON);
    const early = (await templatesFor(phone, 'reward_upi_ask')).filter((m) =>
      m.dedupe_key.startsWith('payout_reminder:'),
    );
    expect(early).toHaveLength(0);
    // A day after the new ask: round 1 of the new ask.
    await runCare(new Date(NOON.getTime() + DAY + 60_000));
    const later = (await templatesFor(phone, 'reward_upi_ask')).filter((m) =>
      m.dedupe_key.startsWith('payout_reminder:'),
    );
    expect(later).toHaveLength(1);
    expect(later[0]?.dedupe_key.endsWith(':1')).toBe(true);
    expect(customerId).toBeTruthy();
  });

  it('0c: a request resolved, reopened by staff and resolved again is checked again', async () => {
    undos.push(await setTemplate('problem_fixed_check', true));
    const sale = await sellProject(admin, { name: 'Fix Second Resolve (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:nopower');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    await admin.patch(`/service-requests/${request?.id}`, { status: 'resolved' });
    await admin.patch(`/service-requests/${request?.id}`, { status: 'open' });
    await new Promise((done) => setTimeout(done, 20));
    await admin.patch(`/service-requests/${request?.id}`, { status: 'resolved' });
    expect(await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed')).toHaveLength(2);
  });

  it('0h: an unanswered fixed check tells the desk', async () => {
    const sale = await sellProject(admin, { name: 'Fix Fixed Wait (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:nopower');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    await admin.patch(`/service-requests/${request?.id}`, { status: 'resolved' });
    const [ask] = await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed');
    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(NOON.getTime() - 3 * DAY),
    ]);
    await runCare(NOON);
    const desk = await rows('SELECT 1 FROM notifications WHERE dedupe_key LIKE $1', [
      `fixed_waiting:${ask?.id}%`,
    ]);
    expect(desk.length).toBeGreaterThan(0);
  });

  it('0g: the report form keeps its photos when the home is asked in the chat', async () => {
    await setForm('report_problem', FLOW_ID);
    const sale = await sellProject(admin, { name: 'Fix Form Photos (test)' });
    const phone = sale.customer.phone;
    const second = await anotherHome(admin, sale.customer, 'Farm photos (test)');
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const form = await flowOf(phone);
    await sendInbound(phone, {
      form: {
        token: form?.token ?? '',
        photos: [photo('a')],
        fields: { what: 'damage', since: 'today', note: 'See the photo' },
      },
    });
    expect(await requestsOf(sale.customer.customerId)).toHaveLength(0);
    const list = await lastReply(phone);
    expect(list?.kind).toBe('list');
    await tap(phone, `home:${second.projectId}`);
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    expect(request).toMatchObject({ project_id: second.projectId });
    expect(request?.description).toContain('See the photo');
    expect(await filesOn(request?.id ?? '')).toHaveLength(1);
  });
});
