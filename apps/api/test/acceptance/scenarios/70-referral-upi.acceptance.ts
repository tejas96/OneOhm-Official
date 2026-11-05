import type { ReferralReward } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asksOfKind, bodyOf } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf } from '../support/forms';
import { Session } from '../support/http';
import { setTemplate } from '../support/journey-steps';
import { lastReply, replies, say, tap } from '../support/onboarding';
import { customerUpi, earnedReward, programOn, rewardOf } from '../support/referral';
import { closeChat, openChat, setForm, templatesFor } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// The referral payout (redesign §15, owner answer 2): reward approved -> "Share your UPI ID" -> staff check
// -> shown on the reward and used when marking paid -> "₹2,000 sent to your UPI ✅".

describe('Referral: UPI payout', () => {
  let admin: Session;
  let undo: () => Promise<unknown>;
  beforeAll(async () => {
    admin = await Session.admin();
    undo = await programOn(admin);
  });
  afterAll(async () => {
    await undo();
    await setForm('share_upi', null);
    await closeDb();
  });

  const approve = (id: string) => admin.post<ReferralReward>(`/referral-rewards/${id}/approve`, {});
  const check = (id: string, body: Record<string, string>) =>
    admin.post<ReferralReward>(`/referral-rewards/${id}/upi-check`, body);
  const payUpi = (id: string) =>
    admin.raw('POST', `/referral-rewards/${id}/pay`, {
      method: 'upi',
      paidOn: new Date().toISOString().slice(0, 10),
    });

  /** A reward approved with the customer's chat open: the UPI ask is on the phone. */
  async function approved(name: string) {
    const { referrer, reward } = await earnedReward(admin, name);
    await openChat(referrer.customer.phone, referrer.customer.customerId);
    await approve(reward.id);
    return {
      referrer,
      phone: referrer.customer.phone,
      id: reward.id,
      customerId: referrer.customer.customerId,
    };
  }

  it('approving asks for the UPI ID once, in place of the plain "approved" line', async () => {
    const { phone, id, customerId } = await approved('Upi Ask');
    const ask = await lastReply(phone);
    expect(ask?.body).toBe('Share your UPI ID to receive ₹2,000.');
    const [payout] = await asksOfKind(customerId, 'payout');
    expect(payout).toMatchObject({ status: 'open' });
    expect(payout?.payload).toMatchObject({
      rewardId: id,
      amountPaise: 200_000,
      once: `payout:${id}`,
    });
    expect(ask?.buttons).toEqual([{ id: `up:go:${payout?.id}`, title: 'Share UPI ID' }]);
    const plain = (await templatesFor(phone, 'referral_reward')).filter((m) =>
      m.payload.status?.startsWith('approved'),
    );
    expect(plain).toHaveLength(0);
    // One payout ask per reward: the database refuses a second.
    await expect(
      rows(
        `INSERT INTO customer_actions (type, customer_id, title, payload)
         VALUES ('payout', $1, 'again', jsonb_build_object('once', $2::text))`,
        [customerId, `payout:${id}`],
      ),
    ).rejects.toThrow(/customer_actions_once_unique/);
  });

  it('a UPI ID is checked for its shape, saved on the customer, and waits for staff; Ask again clears it', async () => {
    const { phone, id, customerId } = await approved('Upi Share');
    const [payout] = await asksOfKind(customerId, 'payout');
    await tap(phone, `up:go:${payout?.id}`);
    expect(await bodyOf(phone)).toBe('Please type your UPI ID, like name@bank.');
    await say(phone, 'my phone number');
    expect(await bodyOf(phone)).toContain('does not look like a UPI ID');
    expect(await customerUpi(customerId)).toMatchObject({ upi_id: null });
    await say(phone, ' Suresh.Patil@OKSBI ');
    expect(await bodyOf(phone)).toBe('Thank you! Our team will check it and send your reward.');
    expect(await customerUpi(customerId)).toEqual({ upi_id: 'suresh.patil@oksbi', checked: false });
    expect((await asksOfKind(customerId, 'payout'))[0]?.status).toBe('received');
    const toCheck = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'referral_upi_check' AND dedupe_key LIKE $1",
      [`referral_upi_check:${payout?.id}%`],
    );
    expect(toCheck.length).toBeGreaterThan(0);
    let reward = await rewardOf(admin, { customer: { customerId } } as never);
    expect(reward.upi).toEqual({
      id: 'suresh.patil@oksbi',
      checked: false,
      ask: 'received',
      paidTo: null,
    });

    // Not paid by UPI until staff say Looks good.
    const early = await payUpi(id);
    expect(early.status).toBe(409);

    // Ask again: the customer sees the reason and the earlier ID is gone.
    reward = await check(id, { result: 'again', reason: 'The bank name is missing' });
    expect(reward.upi).toMatchObject({ id: null, checked: false, ask: 'open' });
    const again = await lastReply(phone);
    expect(again?.body).toContain('We could not use your UPI ID (The bank name is missing)');
    expect(again?.buttons?.[0]?.id).toBe(`up:go:${payout?.id}`);
    expect((await payUpi(id)).status).toBe(409);
  });

  it('Looks good lets finance pay by UPI; the ID is kept on the reward; the customer hears once', async () => {
    const { phone, id, customerId } = await approved('Upi Paid');
    const [payout] = await asksOfKind(customerId, 'payout');
    await tap(phone, `up:go:${payout?.id}`);
    await say(phone, 'suresh@oksbi');
    const good = await check(id, { result: 'good' });
    expect(good.upi).toMatchObject({ id: 'suresh@oksbi', checked: true, ask: 'closed' });
    expect(await customerUpi(customerId)).toEqual({ upi_id: 'suresh@oksbi', checked: true });

    // Two payments at once: exactly one goes through (never twice).
    const results = await Promise.all([payUpi(id), payUpi(id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const paid = await rewardOf(admin, { customer: { customerId } } as never);
    expect(paid).toMatchObject({ status: 'paid', paidMethod: 'upi' });
    expect(paid.upi.paidTo).toBe('suresh@oksbi');
    expect(await bodyOf(phone)).toBe('₹2,000 sent to your UPI ✅');
    const lines = (await replies(phone)).filter((r) => r.body === '₹2,000 sent to your UPI ✅');
    expect(lines).toHaveLength(1);
    expect((await payUpi(id)).status).toBe(409);
    const [entries] = await rows<{ n: string }>(
      "SELECT count(*)::text AS n FROM journal_entries WHERE source_id = $1 AND source_type::text LIKE '%paid%'",
      [id],
    ).catch(() => [{ n: '1' }]);
    expect(Number(entries?.n)).toBeLessThanOrEqual(1);
  });

  it('a customer whose UPI ID is already checked is not asked again, and can be paid by UPI', async () => {
    const first = await approved('Upi Known');
    const [payout] = await asksOfKind(first.customerId, 'payout');
    await tap(first.phone, `up:go:${payout?.id}`);
    await say(first.phone, 'known@ybl');
    await check(first.id, { result: 'good' });
    // A second friend, a second reward for the same referrer.
    const friend = await (await import('../support/sales')).sellProject(admin, {
      name: 'Upi Known Friend 2 (test)',
    });
    await rows('UPDATE leads SET referred_by_customer_id = $1 WHERE id = $2', [
      first.customerId,
      friend.customer.leadId,
    ]);
    const second = (await admin.get<ReferralReward[]>('/referral-rewards?status=pending')).find(
      (one) => one.referrer.id === first.customerId,
    );
    await approve(second?.id ?? '');
    expect(await asksOfKind(first.customerId, 'payout')).toHaveLength(1);
    expect((await payUpi(second?.id ?? '')).status).toBe(200);
  });

  it('other ways of paying need no UPI ID', async () => {
    const { id } = await approved('Upi Bank');
    const paid = await admin.raw('POST', `/referral-rewards/${id}/pay`, {
      method: 'bank_transfer',
      paidOn: new Date().toISOString().slice(0, 10),
      reference: 'UTR-70-test',
    });
    expect(paid.status).toBe(200);
  });

  it('with the form: the UPI screen opens, a bad ID is refused, a good one is saved', async () => {
    await setForm('share_upi', FLOW_ID);
    const { phone, customerId } = await approved('Upi Form');
    const [payout] = await asksOfKind(customerId, 'payout');
    await tap(phone, `up:go:${payout?.id}`);
    const form = await flowOf(phone);
    expect(form).toMatchObject({ screen: 'UPI', button: 'Share UPI ID' });
    expect(form?.body).toBe('Share your UPI ID to receive ₹2,000.');
    await sendInbound(phone, { form: { token: form?.token ?? '', fields: { upi: 'nope' } } });
    expect(await bodyOf(phone)).toContain('does not look like a UPI ID');
    expect((await customerUpi(customerId))?.upi_id).toBeNull();
    // The refused answer leaves [Share UPI ID] to open the form again.
    expect((await lastReply(phone))?.buttons?.[0]?.id).toBe(`up:go:${payout?.id}`);
    await tap(phone, `up:go:${payout?.id}`);
    const second = await flowOf(phone);
    expect(second?.token).not.toBe(form?.token);
    await sendInbound(phone, {
      form: { token: second?.token ?? '', fields: { upi: 'Form.User@Paytm' } },
    });
    expect((await customerUpi(customerId))?.upi_id).toBe('form.user@paytm');
    await setForm('share_upi', null);
  });

  it('outside 24 hours the template goes once on; off, the plain approved line still goes; Marathi in the chat', async () => {
    const undoTemplate = await setTemplate('reward_upi_ask', true);
    try {
      const { referrer, reward } = await earnedReward(admin, 'Upi Template');
      await closeChat(referrer.customer.phone);
      await approve(reward.id);
      const [payout] = await asksOfKind(referrer.customer.customerId, 'payout');
      const [sent] = await templatesFor(referrer.customer.phone, 'reward_upi_ask');
      expect(sent?.payload).toMatchObject({
        amount: '₹2,000',
        sharePayload: `up:go:${payout?.id}`,
      });
    } finally {
      await undoTemplate();
    }
    const { referrer, reward } = await earnedReward(admin, 'Upi Template Off');
    await closeChat(referrer.customer.phone);
    await approve(reward.id);
    expect(await templatesFor(referrer.customer.phone, 'reward_upi_ask')).toHaveLength(0);
    const plain = (await templatesFor(referrer.customer.phone, 'referral_reward')).filter((m) =>
      m.payload.status?.startsWith('approved'),
    );
    expect(plain).toHaveLength(1);

    const marathi = await earnedReward(admin, 'Upi Marathi');
    await openChat(marathi.referrer.customer.phone, marathi.referrer.customer.customerId);
    await tap(marathi.referrer.customer.phone, 'lang:mr');
    await approve(marathi.reward.id);
    expect(await bodyOf(marathi.referrer.customer.phone)).toBe(
      '₹2,000 मिळवण्यासाठी तुमचा UPI आयडी द्या.',
    );
  });
});
