import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { sellOn } from '../support/homes';
import { Session } from '../support/http';
import { runPaperReminders } from '../support/paper-reminders';
import { newCustomer, sellProject, today, uniquePhone } from '../support/sales';

// Customer actions (redesign §2): a paper asked of the customer is an action of type paper.
// Several papers of one kind can be asked together; a paper asked on a lead moves to the
// project when one is made; the card lists each action with its status.

interface Asked {
  id: string;
  type: string;
  status: string;
  leadId: string | null;
  projectId: string | null;
  homeName: string | null;
  requestedBy: string | null;
  remindersSent: number;
}

describe('Customer actions', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('Aadhaar and PAN are asked together; the same one twice is refused', async () => {
    const { project } = await sellProject(admin, { name: 'Aadhaar And PAN (test)' });
    const body = { projectId: project.id, category: 'customer_kyc' };
    const ask = (title: string, requirementKey?: string) =>
      admin.raw('POST', '/document-requests', {
        ...body,
        title,
        ...(requirementKey ? { requirementKey } : {}),
      });
    expect((await ask('Aadhaar card (test)', 'free:customer_kyc:aadhaar')).status).toBe(201);
    expect((await ask('PAN card (test)', 'free:customer_kyc:pan')).status).toBe(201);
    expect((await ask('Aadhaar card (test)', 'free:customer_kyc:aadhaar')).status).toBe(409);
    // No key (an older caller): the kind decides, so an ID paper is already asked.
    expect((await ask('Voter ID (test)')).status).toBe(409);
    const open = await rows<{ title: string; requirement_key: string | null }>(
      `SELECT title, requirement_key FROM customer_actions WHERE project_id = $1 ORDER BY created_at`,
      [project.id],
    );
    expect(open.map((row) => row.requirement_key)).toEqual([
      'free:customer_kyc:aadhaar',
      'free:customer_kyc:pan',
    ]);
  });

  it('a paper asked on a lead moves onto the project when one is made', async () => {
    const customer = await newCustomer(admin, { name: 'Lead Paper (test)' });
    const asked = await admin.post<Asked>('/document-requests', {
      leadId: customer.leadId,
      category: 'electricity_bill',
      title: 'Light bill (test)',
    });
    expect(asked).toMatchObject({ leadId: customer.leadId, projectId: null, status: 'open' });
    const [row] = await rows<{ property_id: string | null; project_id: string | null }>(
      'SELECT property_id, project_id FROM customer_actions WHERE id = $1',
      [asked.id],
    );
    expect(row).toEqual({ property_id: customer.propertyId, project_id: null });
    const onLead = await admin.get<Asked[]>(`/document-requests?leadId=${customer.leadId}`);
    expect(onLead.map((one) => one.id)).toEqual([asked.id]);
    const note = await rows(
      `SELECT 1 FROM lead_activities WHERE lead_id = $1 AND note LIKE 'Asked the customer for Light bill%'`,
      [customer.leadId],
    );
    expect(note).toHaveLength(1);

    const project = await sellOn(admin, customer, customer.propertyId);
    const [moved] = await rows<{ project_id: string | null; status: string }>(
      'SELECT project_id, status::text AS status FROM customer_actions WHERE id = $1',
      [asked.id],
    );
    expect(moved).toEqual({ project_id: project.id, status: 'open' });
    const onProject = await admin.get<Asked[]>(`/document-requests?projectId=${project.id}`);
    expect(onProject.map((one) => one.id)).toEqual([asked.id]);
  });

  it('a lead with no site cannot be asked for papers yet', async () => {
    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'No Site Lead (test)',
      phone: uniquePhone(),
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    const refused = await admin.raw('POST', '/document-requests', {
      leadId: lead.id,
      category: 'electricity_bill',
      title: 'Light bill (test)',
    });
    expect(refused.status).toBe(400);
  });

  it('the card lists each action with its type, home, status, asker and reminders', async () => {
    const { project, customer } = await sellProject(admin, { name: 'Card Lists (test)' });
    const bill = await admin.post<Asked>('/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title: 'Light bill (test)',
    });
    const cancelled = await admin.post<Asked>('/document-requests', {
      projectId: project.id,
      category: 'customer_kyc',
      title: 'Aadhaar (test)',
    });
    await admin.post(`/document-requests/${cancelled.id}/cancel`, {});
    await rows(
      "UPDATE customer_actions SET created_at = now() - interval '49 hours' WHERE id = $1",
      [bill.id],
    );
    await runPaperReminders();
    for (const scope of [`projectId=${project.id}`, `customerId=${customer.customerId}`]) {
      const listed = await admin.get<Asked[]>(`/document-requests?${scope}`);
      // Open first, then the cancelled one.
      expect(listed.map((one) => [one.id, one.status])).toEqual([
        [bill.id, 'open'],
        [cancelled.id, 'cancelled'],
      ]);
      expect(listed[0]).toMatchObject({ type: 'paper', requestedBy: admin.name, remindersSent: 1 });
      expect(listed[0]?.homeName).toBeTruthy();
      expect(listed[1]?.remindersSent).toBe(0);
    }
  });
});
