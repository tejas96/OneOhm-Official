import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { API, Session } from '../support/http';
import { milestoneOf, signedWebhook } from '../support/money';
import { sellProject } from '../support/sales';

// After the customer pays online: receipt on WhatsApp, staff told, one fresh link on expiry.
describe('WhatsApp after payment', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const advanceLink = async (name: string) => {
    const { customer, project } = await sellProject(admin, { name });
    const milestone = milestoneOf(project, 'quotation_accepted');
    const [sent] = await rows<{ payload: Record<string, string> }>(
      "select payload from outbox where recipient = $1 and template = 'payment_link' order by created_at desc limit 1",
      [customer.phone],
    );
    const opened = await fetch(`${API}/pay/due/${sent?.payload.payToken}`, { redirect: 'manual' });
    const sandboxId = (opened.headers.get('location') ?? '').split('/').pop() ?? '';
    return { customer, project, milestone, sandboxId };
  };
  const milestoneStatus = async (id: string) =>
    (await rows<{ status: string }>('select status from payment_milestones where id = $1', [id]))[0]
      ?.status;
  const freshLinks = (milestoneId: string) =>
    rows<{ dedupe_key: string }>(
      `select o.dedupe_key from outbox o join payment_links l on o.dedupe_key = 'link_expired:' || l.id
       where l.milestone_id = $1`,
      [milestoneId],
    );
  const expire = (sandboxId: string) =>
    signedWebhook({
      event: 'payment_link.expired',
      payload: { payment_link: { entity: { id: sandboxId } } },
    });

  it('a sandbox payment records the money and sends the receipt PDF', async () => {
    const { customer, project, milestone, sandboxId } = await advanceLink(
      'After Pay Receipt Customer (test)',
    );
    const paid = await fetch(`${API}/pay/sandbox/${sandboxId}`, { method: 'POST' });
    expect(paid.status).toBeLessThan(300);

    expect(await milestoneStatus(milestone.id)).toBe('paid');
    const [received] = await rows<{ payload: Record<string, string> }>(
      "select payload from outbox where recipient = $1 and template = 'payment_received'",
      [customer.phone],
    );
    expect(received?.payload.documentName).toMatch(/\.pdf$/);
    const file = await fetch(received?.payload.documentUrl ?? '');
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toContain('application/pdf');
    const [receipt] = await rows<{ receipt_number: string }>(
      'select receipt_number from payments where milestone_id = $1',
      [milestone.id],
    );
    expect(received?.payload.documentName).toBe(
      `${receipt?.receipt_number.replaceAll('/', '-')}.pdf`,
    );

    const alerts = await rows<{ user_id: string; body: string }>(
      "select user_id, body from notifications where kind = 'payment_online' and project_id = $1",
      [project.id],
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.body).toContain('paid online by After Pay Receipt Customer (test)');
    const activity = await rows(
      "select 1 from project_activities where project_id = $1 and kind = 'payment'",
      [project.id],
    );
    expect(activity.length).toBeGreaterThan(0);
  });

  it('an old Pay now link says already paid once the milestone is paid', async () => {
    const { customer, sandboxId } = await advanceLink('After Pay Old Link Customer (test)');
    await fetch(`${API}/pay/sandbox/${sandboxId}`, { method: 'POST' });
    const [sent] = await rows<{ payload: Record<string, string> }>(
      "select payload from outbox where recipient = $1 and template = 'payment_link' order by created_at desc limit 1",
      [customer.phone],
    );

    const page = await fetch(`${API}/pay/due/${sent?.payload.payToken}`, { redirect: 'manual' });

    expect(page.status).toBe(200);
    const text = await page.text();
    expect(text).toContain('This is already paid. Thank you!');
    expect(text).not.toContain('not due yet');
  });

  it('an expired link sends one fresh Pay now', async () => {
    const { customer, milestone, sandboxId } = await advanceLink(
      'After Pay Expired Customer (test)',
    );

    expect((await expire(sandboxId)).status).toBe(200);
    expect((await expire(sandboxId)).status).toBe(200);

    expect(await freshLinks(milestone.id)).toHaveLength(1);
    const [fresh] = await rows<{ payload: Record<string, string> }>(
      "select payload from outbox where recipient = $1 and dedupe_key like 'link_expired:%'",
      [customer.phone],
    );
    expect(fresh?.payload.payToken).toBeTruthy();
    expect(fresh?.payload.link).toContain('/v1/pay/due/');
    const [link] = await rows<{ id: string }>(
      'select id from payment_links where milestone_id = $1',
      [milestone.id],
    );
    const told = await rows<{ user_id: string }>(
      "select user_id from notifications where kind = 'payment_link_expired' and dedupe_key like $1",
      [`link_expired:${link?.id}:%`],
    );
    expect(told.length).toBeGreaterThan(0);
    expect(new Set(told.map((row) => row.user_id)).size).toBe(told.length);
    expect(told).toHaveLength(1);
  });

  it('no fresh link when the milestone is already paid', async () => {
    const { milestone, sandboxId } = await advanceLink('After Pay Settled Customer (test)');
    await rows("update payment_milestones set status = 'paid' where id = $1", [milestone.id]);

    expect((await expire(sandboxId)).status).toBe(200);

    expect(await freshLinks(milestone.id)).toHaveLength(0);
  });
});
