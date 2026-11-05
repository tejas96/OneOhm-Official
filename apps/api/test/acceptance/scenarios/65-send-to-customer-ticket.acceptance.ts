import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply } from '../support/onboarding';
import { sellProject, uniquePhone } from '../support/sales';
import { openChat, optionsOf, sendTo } from '../support/send';

// Redesign §18 6: on a service ticket "Send to customer" offers the technician's number, the visit
// ask and a call-back (nothing that belongs to the project's own steps).

describe('Send to customer on a service ticket', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it("shares the assigned technician's name and number", async () => {
    const phone = uniquePhone();
    await rows('UPDATE users SET phone_e164 = $2 WHERE id = $1 AND phone_e164 IS NULL', [
      admin.userId,
      phone,
    ]);
    const sale = await sellProject(admin, { name: 'Ticket Crew (test)' });
    const [request] = await rows<{ id: string }>(
      `INSERT INTO service_requests (customer_id, project_id, category, description, assignee_user_id)
       VALUES ($1, $2, 'inverter', 'Inverter error (test)', $3) RETURNING id`,
      [sale.customer.customerId, sale.project.id, admin.userId],
    );
    await openChat(sale.customer.phone, sale.customer.customerId);
    const scope = { serviceRequestId: request?.id ?? '' };
    const options = await optionsOf(admin, scope);
    const actions = new Set(options.offers.map((one) => one.action));
    expect([...actions].sort()).toEqual(['ask_callback', 'ask_visit', 'share_crew']);
    const crew = options.offers.find((one) => one.action === 'share_crew');
    expect(crew?.preview?.body).toContain('service visit');
    if (!crew?.request) throw new Error('no technician to share');
    await sendTo(admin, scope, crew.request);
    expect((await lastReply(sale.customer.phone))?.body).toBe(crew.preview?.body);
  });
});
