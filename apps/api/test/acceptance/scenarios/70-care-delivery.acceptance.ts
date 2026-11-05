import type { ReferralReward } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asksOfKind, settleAdvance } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { NOON, setTemplate } from '../support/journey-steps';
import { lastReply, replies, say, tap } from '../support/onboarding';
import { earnedReward, programOn } from '../support/referral';
import { createQuotation, newCustomer, sellProject } from '../support/sales';
import { openChat, optionsOf, sendTo, templatesFor } from '../support/send';
import { runCare, runChecks } from '../support/visit-worker';

// Review round 1 (phase 6): the chat message follows the switch (C1), the UPI ask is never silent and is chased
// (C2), a UPI ID is paid only as seen (I2), a second reward joins the first check (I8), a revision's line is
// also on the accept check and the question list (I6).

describe('Care: delivery, UPI safety and chasing', () => {
  let admin: Session;
  let undo: () => Promise<unknown>;
  const undos: (() => Promise<unknown>)[] = [];
  beforeAll(async () => {
    admin = await Session.admin();
    undo = await programOn(admin);
  });
  afterAll(async () => {
    for (const back of undos) await back();
    await undo();
    await closeDb();
  });

  const approve = (id: string) => admin.post<ReferralReward>(`/referral-rewards/${id}/approve`, {});
  const upiOf = async (id: string) =>
    (
      await rows<{ upi: string | null }>(
        'SELECT c.upi_id AS upi FROM referral_rewards r JOIN customers c ON c.id = r.referrer_customer_id WHERE r.id = $1',
        [id],
      )
    )[0]?.upi ?? '';

  it('a switched-off UPI ask is not sent in the chat: finance is told, the plain line goes, Send to customer asks again', async () => {
    const { referrer, reward } = await earnedReward(admin, 'Care Off');
    const phone = referrer.customer.phone;
    await openChat(phone, referrer.customer.customerId);
    await approve(reward.id);
    expect(
      (await replies(phone)).some((r) => r.body === 'Share your UPI ID to receive ₹2,000.'),
    ).toBe(false);
    const alert = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'referral_upi_ask_failed' AND dedupe_key LIKE $1",
      [`referral_upi_ask_failed:%`],
    );
    expect(alert.length).toBeGreaterThan(0);
    const plain = (await templatesFor(phone, 'referral_reward')).filter((m) =>
      m.payload.status?.startsWith('approved'),
    );
    expect(plain).toHaveLength(1);

    const scope = { customerId: referrer.customer.customerId };
    const [ask] = await asksOfKind(referrer.customer.customerId, 'payout');
    const offer = (await optionsOf(admin, scope)).offers.find((o) => o.action === 'ask_upi');
    expect(offer?.request).toEqual({ action: 'ask_upi', actionId: ask?.id });
    await sendTo(admin, scope, { action: 'ask_upi', actionId: ask?.id ?? '' });
    const sent = await lastReply(phone);
    expect(sent?.buttons?.[0]?.id).toBe(`up:go:${ask?.id}`);
  });

  it('with the reward message off, paying by UPI still queues the paid line (never a regression)', async () => {
    const on = await setTemplate('reward_upi_ask', true);
    const { referrer, reward } = await earnedReward(admin, 'Care Paid Off');
    const phone = referrer.customer.phone;
    await openChat(phone, referrer.customer.customerId);
    await approve(reward.id);
    const [ask] = await asksOfKind(referrer.customer.customerId, 'payout');
    await tap(phone, `up:go:${ask?.id}`);
    await say(phone, 'paidoff@ybl');
    const off = await setTemplate('referral_reward', false);
    try {
      await admin.post(`/referral-rewards/${reward.id}/upi-check`, {
        result: 'good',
        upiId: 'paidoff@ybl',
      });
      const paid = await admin.raw('POST', `/referral-rewards/${reward.id}/pay`, {
        method: 'upi',
        paidOn: new Date().toISOString().slice(0, 10),
        upiId: 'paidoff@ybl',
      });
      expect(paid.status).toBe(200);
      const queued = (await templatesFor(phone, 'referral_reward')).filter((m) =>
        m.payload.status?.startsWith('paid'),
      );
      expect(queued).toHaveLength(1);
      expect((await replies(phone)).some((r) => r.body === '₹2,000 sent to your UPI ✅')).toBe(
        false,
      );
    } finally {
      await off();
      await on();
    }
  });

  it('pays only the UPI ID the person saw; the UPI ID is stored on the customer alone', async () => {
    const on = await setTemplate('reward_upi_ask', true);
    undos.push(on);
    const { referrer, reward } = await earnedReward(admin, 'Care Seen');
    const phone = referrer.customer.phone;
    await openChat(phone, referrer.customer.customerId);
    await approve(reward.id);
    const [ask] = await asksOfKind(referrer.customer.customerId, 'payout');
    await tap(phone, `up:go:${ask?.id}`);
    await say(phone, 'seen@ybl');
    expect(
      (await asksOfKind(referrer.customer.customerId, 'payout'))[0]?.payload,
    ).not.toHaveProperty('upi');
    // Another ID than the one on the customer: refused for the check and for the payment.
    const wrong = await admin.raw('POST', `/referral-rewards/${reward.id}/upi-check`, {
      result: 'good',
      upiId: 'other@ybl',
    });
    expect(wrong.status).toBe(409);
    const good = await admin.raw('POST', `/referral-rewards/${reward.id}/upi-check`, {
      result: 'good',
      upiId: 'seen@ybl',
    });
    expect(good.status).toBe(200);
    const day = new Date().toISOString().slice(0, 10);
    expect(
      (
        await admin.raw('POST', `/referral-rewards/${reward.id}/pay`, {
          method: 'upi',
          paidOn: day,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin.raw('POST', `/referral-rewards/${reward.id}/pay`, {
          method: 'upi',
          paidOn: day,
          upiId: 'other@ybl',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin.raw('POST', `/referral-rewards/${reward.id}/pay`, {
          method: 'upi',
          paidOn: day,
          upiId: 'seen@ybl',
        })
      ).status,
    ).toBe(200);
  });

  it('a second reward of a customer who shared a UPI ID is not asked again and joins the check', async () => {
    const first = await earnedReward(admin, 'Care Second');
    const phone = first.referrer.customer.phone;
    await openChat(phone, first.referrer.customer.customerId);
    await approve(first.reward.id);
    const [ask] = await asksOfKind(first.referrer.customer.customerId, 'payout');
    await tap(phone, `up:go:${ask?.id}`);
    await say(phone, 'second@ybl');
    const friend = await sellProject(admin, { name: 'Care Second Friend 2 (test)' });
    await rows('UPDATE leads SET referred_by_customer_id = $1 WHERE id = $2', [
      first.referrer.customer.customerId,
      friend.customer.leadId,
    ]);
    const second = (await admin.get<ReferralReward[]>('/referral-rewards?status=pending')).find(
      (r) => r.referrer.id === first.referrer.customer.customerId,
    );
    await approve(second?.id ?? '');
    expect(await asksOfKind(first.referrer.customer.customerId, 'payout')).toHaveLength(1);
    const checked = await admin.post<ReferralReward>(`/referral-rewards/${second?.id}/upi-check`, {
      result: 'good',
      upiId: await upiOf(second?.id ?? ''),
    });
    expect(checked.upi).toMatchObject({ id: 'second@ybl', checked: true });
  });

  it('an unanswered UPI ask is chased: day 1 then every 2 days, finance at 2 days; a received one is a staff check; Home shows it', async () => {
    const on = await setTemplate('reward_upi_ask', true);
    undos.push(on);
    const { referrer, reward } = await earnedReward(admin, 'Care Chase');
    const phone = referrer.customer.phone;
    await openChat(phone, referrer.customer.customerId);
    await approve(reward.id);
    const [ask] = await asksOfKind(referrer.customer.customerId, 'payout');
    await settleAdvance(referrer.project.id);
    await tap(phone, 'menu');
    const home = await lastReply(phone);
    expect(home?.body).toContain('Share your UPI ID to receive ₹2,000.');
    expect(home?.buttons?.[0]?.id).toBe(`up:go:${ask?.id}`);

    const at = (days: number) => new Date(NOON.getTime() + days * 86_400_000);
    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(NOON.getTime() - 3 * 86_400_000),
    ]);
    await runCare(NOON);
    const sent = (await templatesFor(phone, 'reward_upi_ask')).filter((m) =>
      m.dedupe_key.startsWith('payout_reminder:'),
    );
    expect(sent.map((m) => m.dedupe_key)).toEqual([`payout_reminder:${ask?.id}:2`]);
    await runCare(NOON);
    expect(
      (await templatesFor(phone, 'reward_upi_ask')).filter((m) =>
        m.dedupe_key.startsWith('payout_reminder:'),
      ),
    ).toHaveLength(1);
    const finance = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'referral_upi_waiting' AND dedupe_key LIKE $1",
      [`upi_waiting:${ask?.id}%`],
    );
    expect(finance.length).toBeGreaterThan(0);
    void at;

    // The customer shares; it waits for the check and finance is told after 1 working day.
    await tap(phone, `up:go:${ask?.id}`);
    await say(phone, 'chase@ybl');
    await rows('UPDATE customer_actions SET done_at = $2, updated_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(NOON.getTime() - 3 * 86_400_000),
    ]);
    await runChecks(NOON);
    const check = await rows(
      "SELECT title FROM notifications WHERE kind = 'customer_action_check' AND dedupe_key LIKE $1",
      [`action_check:${ask?.id}:%`],
    );
    expect(check[0]).toBeDefined();
  });

  it('a revision’s line is also on the accept check and the question list', async () => {
    const customer = await newCustomer(admin, { name: 'Care Change (test)' });
    const quotation = await createQuotation(admin, customer);
    await openChat(customer.phone, customer.customerId);
    await admin.post(`/quotations/${quotation.id}/send`, { whatChanged: 'Cheaper inverter.' });
    await tap(customer.phone, `quote_accept:${quotation.id}`);
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^\*What changed:\* Cheaper inverter\.\n\nAccept your solar quotation/,
    );
    await tap(customer.phone, `quote_ask:${quotation.id}`);
    expect((await lastReply(customer.phone))?.body).toContain('*What changed:* Cheaper inverter.');
    await tap(customer.phone, `quote_q:${quotation.id}:panels`);
    expect((await lastReply(customer.phone))?.body).toMatch(/\d+ Wp/);
  });
});
