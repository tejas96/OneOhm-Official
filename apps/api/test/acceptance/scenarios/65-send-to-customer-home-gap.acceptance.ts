import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { actionOf, askedBill, FLOW_ID, flowOf, photo, setFlow } from '../support/forms';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { actionsOf, openChat, sendTo } from '../support/send';
import { docsOf } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Phase 2b gap: an asked paper with no known home and 2+ homes asks "For which home?" first, then
// opens the form for that home. And the reminders for the asks the team sends (2 days customer,
// 4 days the person who asked).

describe('Send to customer: the home gap and reminders', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    await setFlow(FLOW_ID);
  });
  afterAll(async () => {
    await setFlow(null);
    await closeDb();
  });

  it('an asked paper without a home asks "For which home?" first; the form then files on that home', async () => {
    const { customer, ask } = await askedBill(admin, 'Gap Two Homes (test)');
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    await rows('UPDATE customer_actions SET project_id = NULL, property_id = NULL WHERE id = $1', [
      ask.id,
    ]);
    await tap(customer.phone, `sendit:${ask.id}`);
    const list = (
      await rows<{ payload: { body: string; rows: { id: string; title: string }[] } }>(
        "SELECT payload FROM outbox WHERE recipient = $1 AND template = 'session:list' ORDER BY created_at DESC LIMIT 1",
        [customer.phone],
      )
    )[0]?.payload;
    expect(list?.body).toBe('For which home?');
    expect(list?.rows).toHaveLength(2);
    expect(await flowOf(customer.phone)).toBeUndefined();
    const row = list?.rows.find((one) => one.id.endsWith(farm.propertyId));
    await tap(customer.phone, row?.id ?? '');
    const flow = await flowOf(customer.phone);
    expect(flow?.data.heading).toBe('Electricity bill (test) — Farm (test)');
    await sendInbound(customer.phone, {
      form: { token: flow?.token ?? '', photos: [photo('bill')] },
    });
    const [doc] = await docsOf(customer.customerId);
    expect(doc).toMatchObject({
      category: 'electricity_bill',
      project_id: farm.projectId,
      property_id: farm.propertyId,
    });
    expect((await actionOf(ask.id))?.status).toBe('received');
    expect((await lastReply(customer.phone))?.body).toMatch(/^Saved ✅ .*Farm \(test\)/);
  });

  it('a location ask is sent again after 2 days and the asker is told after 4; payments and call-backs only tell the asker', async () => {
    const { customer, project } = await askedBill(admin, 'Reminders Asks (test)');
    await openChat(customer.phone, customer.customerId);
    const scope = { projectId: project.id };
    await sendTo(admin, scope, { action: 'ask_location', propertyId: customer.propertyId });
    await sendTo(admin, scope, { action: 'ask_callback' });
    const [location] = await actionsOf(customer.customerId, 'location');
    const [callback] = await actionsOf(customer.customerId, 'callback');
    const db = acceptanceDb().db;
    // 1 hour on a working day (Wednesday noon, business time): nothing yet.
    const noon = new Date('2026-11-04T06:30:00Z');
    const age = (days: number) =>
      rows(
        "UPDATE customer_actions SET created_at = $2 WHERE customer_id = $1 AND type IN ('location','callback')",
        [customer.customerId, new Date(noon.getTime() - days * 86_400_000)],
      );
    await age(0.04);
    expect(await queueActionReminders(db, noon, 'Asia/Kolkata')).toBe(0);
    await age(2.5);
    await queueActionReminders(db, noon, 'Asia/Kolkata');
    const reminders = await rows<{ template: string; payload: { locationPayload: string } }>(
      "SELECT template, payload FROM outbox WHERE recipient = $1 AND dedupe_key LIKE 'action_reminder:%'",
      [customer.phone],
    );
    expect(reminders).toEqual([
      expect.objectContaining({
        template: 'location_request',
        payload: expect.objectContaining({ locationPayload: `locreq:${location?.id}` }),
      }),
    ]);
    // Running it again says nothing twice.
    await queueActionReminders(db, noon, 'Asia/Kolkata');
    expect(
      (
        await rows(
          "SELECT 1 FROM outbox WHERE recipient = $1 AND dedupe_key LIKE 'action_reminder:%'",
          [customer.phone],
        )
      ).length,
    ).toBe(1);
    await age(4.5);
    await queueActionReminders(db, noon, 'Asia/Kolkata');
    await queueActionReminders(db, noon, 'Asia/Kolkata');
    const alerts = await rows<{ dedupe_key: string }>(
      "SELECT dedupe_key FROM notifications WHERE kind = 'customer_action_waiting' AND dedupe_key LIKE ANY($1)",
      [[`action_waiting:${location?.id}%`, `action_waiting:${callback?.id}%`]],
    );
    expect(alerts.map((one) => one.dedupe_key.split(':')[1]).sort()).toEqual(
      [callback?.id, location?.id].sort(),
    );
  });
});
