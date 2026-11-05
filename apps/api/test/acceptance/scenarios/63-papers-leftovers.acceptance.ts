import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { upload } from '../support/files';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { lastReply } from '../support/onboarding';
import { sellProject, today, uniquePhone } from '../support/sales';

// Phase 1b review leftovers: the checklist reads a request's home from its project first, a
// lead nobody may see is "not found", and the team's "Looks good" tells the customer only
// about papers a customer holds.

interface Item {
  key: string;
  requested: boolean;
}

describe('Papers: review leftovers', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it("a request is counted on its project's home, not the one it was first asked on", async () => {
    const { customer, project } = await sellProject(admin, { name: 'Project Home First (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
      requirementKey: 'bill',
    });
    // An older ask carries the other home's property; the project's home still wins.
    await rows('UPDATE customer_actions SET property_id = $2 WHERE id = $1', [
      asked.id,
      farm.propertyId,
    ]);
    const billOf = async (projectId: string) =>
      (await admin.get<{ items: Item[] }>(`/projects/${projectId}/document-checklist`)).items.find(
        (item) => item.key === 'bill',
      );
    expect((await billOf(project.id))?.requested).toBe(true);
    expect((await billOf(farm.projectId))?.requested).toBe(false);
  });

  it('a lead that is not there is not found; a lead with no site is told to add one', async () => {
    const ask = (leadId: string) =>
      admin.raw('POST', '/document-requests', {
        leadId,
        category: 'electricity_bill',
        title: 'Light bill (test)',
      });
    // Not found, never a hint about a site (the same answer for a lead this person cannot see).
    expect((await ask(randomUUID())).status).toBe(404);
    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'No Site Yet (test)',
      phone: uniquePhone(),
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    const noSite = await ask(lead.id);
    expect(noSite.status).toBe(400);
  });

  it('Looks good tells the customer only about papers a customer holds', async () => {
    const { customer } = await sellProject(admin, { name: 'Our Own Paper (test)' });
    const ours = await upload<{ id: string }>(admin, 'document', {
      category: 'quotation',
      customerId: customer.customerId,
    });
    const before = await lastReply(customer.phone);
    expect((await admin.raw('POST', `/documents/${ours.id}/check`, {})).status).toBe(200);
    const told = await rows(
      "SELECT 1 FROM notifications WHERE customer_id = $1 AND kind = 'paper_checked'",
      [customer.customerId],
    );
    expect(told).toHaveLength(0);
    expect(await lastReply(customer.phone)).toEqual(before);
  });
});
