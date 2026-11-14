import type { ReferralReward } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asksOfKind, bodyOf } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf, formLinkOf, OLD, photo } from '../support/forms';
import { Session } from '../support/http';
import { milestoneOf } from '../support/money';
import { lastReply, replies, tap } from '../support/onboarding';
import { customerUpi, earnedReward, programOn } from '../support/referral';
import { sellProject } from '../support/sales';
import { actionsOf, openChat, sendTo, setForm } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// The UPI and "I paid another way" forms, edge cases: bad shapes, re-submit, amounts and days that cannot
// be read or do not fit, and what finance and the staff card are given.

describe('Forms: UPI and paid another way, edges', () => {
  let admin: Session;
  let undo: () => Promise<unknown>;
  beforeAll(async () => {
    admin = await Session.admin();
    undo = await programOn(admin);
    await setForm('share_upi', FLOW_ID);
    await setForm('paid_another_way', FLOW_ID);
  });
  afterAll(async () => {
    await setForm('share_upi', null);
    await setForm('paid_another_way', null);
    await undo();
    await closeDb();
  });

  async function upiAsk(name: string) {
    const { referrer, reward } = await earnedReward(admin, name);
    const phone = referrer.customer.phone;
    await openChat(phone, referrer.customer.customerId);
    await admin.post<ReferralReward>(`/referral-rewards/${reward.id}/approve`, {});
    const [ask] = await asksOfKind(referrer.customer.customerId, 'payout');
    return {
      phone,
      customerId: referrer.customer.customerId,
      reward: reward.id,
      ask: ask?.id ?? '',
    };
  }

  it('bad UPI shapes save nothing and offer the form again; a good one is lower-cased and linked', async () => {
    const { phone, customerId, ask } = await upiAsk('Upi Edge');
    for (const bad of ['', 'name@', '@bank', 'a b c', 'name@bank@x', 'x@1', '9876543210']) {
      await tap(phone, `up:go:${ask}`);
      const form = await flowOf(phone);
      await sendInbound(phone, { form: { token: form?.token ?? '', fields: { upi: bad } } });
      expect(await bodyOf(phone), bad).toContain('does not look like a UPI ID');
      expect((await customerUpi(customerId))?.upi_id, bad).toBeNull();
      expect((await asksOfKind(customerId, 'payout'))[0]?.status).toBe('open');
    }
    await tap(phone, `up:go:${ask}`);
    const form = await flowOf(phone);
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { upi: ' Asha.Patil@OKHDFCBank ' } },
    });
    expect((await customerUpi(customerId))?.upi_id).toBe('asha.patil@okhdfcbank');
    expect(await formLinkOf(phone)).toEqual({ kind: 'customer', id: customerId });
    // The same form again: its token is spent, and the ask is closed.
    await sendInbound(phone, { form: { token: form?.token ?? '', fields: { upi: 'other@ybl' } } });
    expect((await replies(phone)).some((reply) => reply.body === OLD)).toBe(true);
    expect((await customerUpi(customerId))?.upi_id).toBe('asha.patil@okhdfcbank');
  });

  it('after staff say Ask again, a second form updates the UPI ID', async () => {
    const { phone, customerId, reward, ask } = await upiAsk('Upi Resubmit');
    await tap(phone, `up:go:${ask}`);
    const first = await flowOf(phone);
    await sendInbound(phone, { form: { token: first?.token ?? '', fields: { upi: 'one@ybl' } } });
    await admin.post(`/referral-rewards/${reward}/upi-check`, {
      result: 'again',
      reason: 'Typo',
      upiId: 'one@ybl',
    });
    expect((await customerUpi(customerId))?.upi_id).toBeNull();
    await tap(phone, `up:go:${ask}`);
    const second = await flowOf(phone);
    await sendInbound(phone, { form: { token: second?.token ?? '', fields: { upi: 'two@ybl' } } });
    expect((await customerUpi(customerId))?.upi_id).toBe('two@ybl');
  });

  async function owing(name: string) {
    const sale = await sellProject(admin, { name });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    await sendTo(
      admin,
      { projectId: sale.project.id },
      {
        action: 'ask_payment_proof',
        milestoneId: advance.id,
      },
    );
    await tap(phone, `paidother:${advance.id}`);
    const form = await flowOf(phone);
    return { sale, phone, form, advance };
  }
  const alertOf = async (projectId: string) =>
    (
      await rows<{ body: string }>(
        "SELECT body FROM notifications WHERE kind = 'payment_proof' AND subject_id = $1 ORDER BY created_at DESC LIMIT 1",
        [projectId],
      )
    )[0]?.body ?? '';

  it('an amount of 0, words, or a day in the future: the proof is kept, finance sees what was typed, the customer is told', async () => {
    const zero = await owing('Paid Zero (test)');
    const tomorrow = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await sendInbound(zero.phone, {
      form: { token: zero.form?.token ?? '', photos: [photo('p')], amount: '0', date: tomorrow },
    });
    const body = await alertOf(zero.sale.project.id);
    expect(body).toContain('amount typed "0" could not be read');
    expect(body).toContain(`date "${tomorrow}" could not be read or is in the future`);
    expect((await lastReply(zero.phone))?.body).toContain('could not read the amount or the date');
    const [pay] = await actionsOf(zero.sale.customer.customerId, 'pay');
    expect(pay?.status).toBe('received');
    expect(pay?.payload).toMatchObject({ proof: { amountText: '0', dateText: tomorrow } });
    expect(await formLinkOf(zero.phone)).toEqual({ kind: 'project', id: zero.sale.project.id });

    const words = await owing('Paid Words (test)');
    await sendInbound(words.phone, {
      form: { token: words.form?.token ?? '', photos: [photo('p')], amount: 'twelve thousand' },
    });
    expect(await alertOf(words.sale.project.id)).toContain('"twelve thousand" could not be read');
  });

  it('more than the amount due is recorded as typed and flagged for finance; a clean proof says nothing extra', async () => {
    const over = await owing('Paid Over (test)');
    await sendInbound(over.phone, {
      form: {
        token: over.form?.token ?? '',
        photos: [photo('p')],
        amount: '99,00,000',
        date: new Date().toISOString().slice(0, 10),
      },
    });
    expect(await alertOf(over.sale.project.id)).toMatch(/more than the ₹[\d,]+ due/);
    expect((await lastReply(over.phone))?.body).not.toContain('could not read');

    const fine = await owing('Paid Fine (test)');
    await sendInbound(fine.phone, {
      form: {
        token: fine.form?.token ?? '',
        photos: [photo('p')],
        amount: '₹ 5,000',
        date: '2026-11-03',
      },
    });
    const body = await alertOf(fine.sale.project.id);
    expect(body).toContain('₹5,000 on 2026-11-03');
    expect(body).not.toContain('more than');
  });
});
