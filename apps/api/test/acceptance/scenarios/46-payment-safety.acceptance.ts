import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { API, Session } from '../support/http';
import { milestoneOf, recordPayment, signedWebhook } from '../support/money';
import { sellProject } from '../support/sales';

// Money safety: opening a pay link changes nothing, a payment is recorded once even when
// two reports arrive together, refunds reach finance, and receipt numbers keep counting.
describe('Payment safety', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const payToken = async (phone: string) => {
    const [sent] = await rows<{ payload: Record<string, string> }>(
      "select payload from outbox where recipient = $1 and template = 'payment_link' order by created_at desc limit 1",
      [phone],
    );
    return sent?.payload.payToken ?? '';
  };
  const linksOf = (milestoneId: string) =>
    rows<{ provider_link_id: string; status: string; paid_paise: string }>(
      'select provider_link_id, status, paid_paise from payment_links where milestone_id = $1',
      [milestoneId],
    );

  it('opening the pay link only shows the amount; Continue makes the gateway link', async () => {
    const { customer, project } = await sellProject(admin, {
      name: 'Safe Pay Page Customer (test)',
    });
    const advance = milestoneOf(project, 'quotation_accepted');
    const token = await payToken(customer.phone);

    const page = await fetch(`${API}/pay/due/${token}`, { redirect: 'manual' });
    expect(page.status).toBe(200);
    const text = await page.text();
    expect(text).toContain('Continue to pay');
    expect(text).toContain(advance.label);
    expect(text).toMatch(/Pay ₹[\d,]+ to OneOhm/);
    // A link preview or a scanner opening it twice makes nothing at the gateway.
    await fetch(`${API}/pay/due/${token}`, { redirect: 'manual' });
    expect(await linksOf(advance.id)).toHaveLength(0);

    const go = await fetch(`${API}/pay/due/${token}`, { method: 'POST', redirect: 'manual' });
    expect(go.status).toBe(303);
    expect(go.headers.get('location')).toContain('/v1/pay/sandbox/');
    const again = await fetch(`${API}/pay/due/${token}?go=1`, { redirect: 'manual' });
    expect(again.status).toBe(303);
    expect(again.headers.get('location')).toBe(go.headers.get('location'));
    expect(await linksOf(advance.id)).toHaveLength(1);
  });

  it('the same payment reported twice at once is recorded once and the link is paid', async () => {
    const { customer, project } = await sellProject(admin, {
      name: 'Safe Pay Race Customer (test)',
    });
    const advance = milestoneOf(project, 'quotation_accepted');
    await fetch(`${API}/pay/due/${await payToken(customer.phone)}`, { method: 'POST' });
    const [link] = await linksOf(advance.id);
    const paid = {
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: link?.provider_link_id } },
        payment: {
          entity: { id: `pay_race_${Date.now()}`, amount: advance.amountPaise, fee: 0 },
        },
      },
    };

    const outcomes = await Promise.all([signedWebhook(paid), signedWebhook(paid)]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([200, 200]);
    expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual([
      'already recorded',
      'recorded',
    ]);
    const recorded = await rows('select 1 from payments where milestone_id = $1', [advance.id]);
    expect(recorded).toHaveLength(1);
    expect((await linksOf(advance.id))[0]?.status).toBe('paid');
  });

  it('a refund or dispute alerts finance with the receipt and reverses nothing', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Safe Refund Customer (test)' });
    const advance = milestoneOf(project, 'quotation_accepted');
    const go = await fetch(`${API}/pay/due/${await payToken(customer.phone)}`, {
      method: 'POST',
      redirect: 'manual',
    });
    const sandboxId = (go.headers.get('location') ?? '').split('/').pop() ?? '';
    await fetch(`${API}/pay/sandbox/${sandboxId}`, { method: 'POST' });
    const [payment] = await rows<{ gateway_payment_id: string; receipt_number: string }>(
      'select gateway_payment_id, receipt_number from payments where milestone_id = $1',
      [advance.id],
    );
    const paymentId = payment?.gateway_payment_id ?? '';

    const refund = await signedWebhook({
      event: 'refund.processed',
      payload: {
        refund: { entity: { id: `rfnd_${Date.now()}`, payment_id: paymentId, amount: 50_000 } },
        payment: { entity: { id: paymentId } },
      },
    });
    const dispute = await signedWebhook({
      event: 'payment.dispute.created',
      payload: {
        dispute: { entity: { id: `disp_${Date.now()}`, payment_id: paymentId, amount: 50_000 } },
        payment: { entity: { id: paymentId } },
      },
    });

    expect(refund.status).toBe(200);
    expect(dispute.status).toBe(200);
    const alerts = await rows<{ body: string; title: string }>(
      "select title, body from notifications where kind = 'payment_refund' and project_id = $1",
      [project.id],
    );
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(alerts[0]?.title).toBe(`Refund/dispute on receipt ${payment?.receipt_number}`);
    expect(alerts[0]?.body).toContain('please check');
    const audits = await rows(
      "select 1 from audit_log where action = 'payment.refund_or_dispute' and entity_id = $1",
      [project.id],
    );
    expect(audits).toHaveLength(2);
    // Nothing is reversed: the milestone stays paid until finance decides.
    const [milestone] = await rows<{ status: string }>(
      'select status from payment_milestones where id = $1',
      [advance.id],
    );
    expect(milestone?.status).toBe('paid');
  });

  it('receipt 10000 follows 9999', async () => {
    const { project } = await sellProject(admin, { name: 'Safe Receipt Customer (test)' });
    // An old financial year, so no other scenario's receipts share the series.
    const receivedOn = '2020-05-04';
    const [advance, dispatch, final] = [
      milestoneOf(project, 'quotation_accepted'),
      milestoneOf(project, 'material_dispatch'),
      milestoneOf(project, 'commissioning_completed'),
    ];
    await recordPayment(admin, project.id, advance, 'upi', { receivedOn });
    await recordPayment(admin, project.id, dispatch, 'upi', { receivedOn });
    await rows(
      `update payments set receipt_number = case milestone_id when $1 then 'OH/RCPT/2020-21/9999'
         else 'OH/RCPT/2020-21/10000' end where milestone_id in ($1, $2)`,
      [advance.id, dispatch.id],
    );

    await recordPayment(admin, project.id, final, 'upi', { receivedOn });

    const [next] = await rows<{ receipt_number: string }>(
      'select receipt_number from payments where milestone_id = $1',
      [final.id],
    );
    expect(next?.receipt_number).toBe('OH/RCPT/2020-21/10001');
  });
});
